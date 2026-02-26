import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GET } from "./route";

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
});
