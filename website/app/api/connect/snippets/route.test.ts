import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createConnectTelemetry } from "../../../../lib/connect-telemetry";
import { createSnippetsPostHandler } from "./handlers";
import { GET, POST } from "./route";

const ORIGINAL_NEXT_PUBLIC_MCP_BASE_URL = process.env.NEXT_PUBLIC_MCP_BASE_URL;
const ORIGINAL_BARDO_MCP_BASE_URL = process.env.BARDO_MCP_BASE_URL;

function makeRequest(url: string): Request {
	return new Request(url);
}

beforeEach(() => {
	delete process.env.NEXT_PUBLIC_MCP_BASE_URL;
	delete process.env.BARDO_MCP_BASE_URL;
});

afterEach(() => {
	if (ORIGINAL_NEXT_PUBLIC_MCP_BASE_URL === undefined) {
		delete process.env.NEXT_PUBLIC_MCP_BASE_URL;
	} else {
		process.env.NEXT_PUBLIC_MCP_BASE_URL = ORIGINAL_NEXT_PUBLIC_MCP_BASE_URL;
	}

	if (ORIGINAL_BARDO_MCP_BASE_URL === undefined) {
		delete process.env.BARDO_MCP_BASE_URL;
	} else {
		process.env.BARDO_MCP_BASE_URL = ORIGINAL_BARDO_MCP_BASE_URL;
	}
});

describe("GET /api/connect/snippets base URL resolution", () => {
	test("rejects requests that omit client or mode", async () => {
		const response = await GET(
			makeRequest("http://localhost:3001/api/connect/snippets"),
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain("Missing client or mode");
	});

	test("rejects API keys in GET query params and requires POST for secrets", async () => {
		const request = makeRequest(
			"http://localhost:3001/api/connect/snippets?client=vscode&mode=remote&apiKey=secret-value",
		);
		const response = await GET(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain("POST");
	});

	test("uses BARDO_MCP_BASE_URL when set", async () => {
		process.env.BARDO_MCP_BASE_URL = "http://127.0.0.1:3000";
		const request = makeRequest(
			"http://localhost:3001/api/connect/snippets?client=vscode&mode=remote",
		);
		const response = await GET(request);
		const body = await response.json();
		expect(body.baseUrl).toBe("http://127.0.0.1:3000/mcp");
	});

	test("uses NEXT_PUBLIC_MCP_BASE_URL when BARDO_MCP_BASE_URL is unset", async () => {
		process.env.NEXT_PUBLIC_MCP_BASE_URL = "https://mcp.bardo.ai";
		const request = makeRequest(
			"http://localhost:3001/api/connect/snippets?client=vscode&mode=remote",
		);
		const response = await GET(request);
		const body = await response.json();
		expect(body.baseUrl).toBe("https://mcp.bardo.ai/mcp");
	});

	test("maps localhost website dev port to MCP dev port by default", async () => {
		const request = makeRequest(
			"http://localhost:3001/api/connect/snippets?client=vscode&mode=remote",
		);
		const response = await GET(request);
		const body = await response.json();
		expect(body.baseUrl).toBe("http://localhost:3000/mcp");
	});

	test("POST accepts connection params in the request body", async () => {
		process.env.BARDO_MCP_BASE_URL = "https://mcp.bardo.ai";
		const response = await POST(
			new Request("https://app.bardo.ai/api/connect/snippets", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client: "claude",
					mode: "local",
					apiKey: "secret-value",
				}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.baseUrl).toBe("https://mcp.bardo.ai/mcp");
		expect(body.client).toBe("claude");
		expect(body.mode).toBe("local");
		expect(body.snippet).toContain("secret-value");
	});

	test("POST rejects requests that omit client or mode", async () => {
		const response = await POST(
			new Request("https://app.bardo.ai/api/connect/snippets", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain("Missing client or mode");
	});

	test("rejects invalid clients", async () => {
		const response = await GET(
			makeRequest(
				"http://localhost:3001/api/connect/snippets?client=not-a-client&mode=remote",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain("Invalid client");
	});

	test("rejects invalid modes", async () => {
		const response = await GET(
			makeRequest(
				"http://localhost:3001/api/connect/snippets?client=vscode&mode=sideways",
			),
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain("Invalid mode");
	});

	test("POST returns 429 when snippet budget is exhausted", async () => {
		const telemetry = createConnectTelemetry();
		const handler = createSnippetsPostHandler({
			consumeSnippetBudget: async () => ({
				allowed: false,
				retryAfterSeconds: 42,
			}),
			telemetry,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/snippets", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client: "claude",
					mode: "remote",
				}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("42");
		expect(body.error).toContain("Too many");
		expect(telemetry.snapshot().connect_snippets_rejected).toBe(1);
	});

	test("POST telemetry tracks success and failure outcomes", async () => {
		const telemetry = createConnectTelemetry();
		const success = createSnippetsPostHandler({
			consumeSnippetBudget: async () => ({ allowed: true }),
			telemetry,
		});
		const failed = createSnippetsPostHandler({
			consumeSnippetBudget: async () => {
				throw new Error("limiter backend unavailable");
			},
			telemetry,
		});

		const okResponse = await success(
			new Request("https://app.bardo.ai/api/connect/snippets", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client: "claude",
					mode: "remote",
				}),
			}),
		);
		const errorResponse = await failed(
			new Request("https://app.bardo.ai/api/connect/snippets", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client: "claude",
					mode: "remote",
				}),
			}),
		);

		expect(okResponse.status).toBe(200);
		expect(errorResponse.status).toBe(500);
		expect(telemetry.snapshot().connect_snippets_success).toBe(1);
		expect(telemetry.snapshot().connect_snippets_failed).toBe(1);
	});
});
