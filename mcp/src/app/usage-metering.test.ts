import { describe, expect, test } from "bun:test";
import { resolveUsageMetering } from "./usage-metering";

describe("resolveUsageMetering", () => {
	test("does not bill raw MCP initialize transport requests", async () => {
		const result = await resolveUsageMetering(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-06-18",
						capabilities: {},
						clientInfo: { name: "test", version: "1.0.0" },
					},
				}),
			}),
			{
				isMcpRoute: true,
				isTurnsApiRoute: false,
				isInitBootstrapApiRoute: false,
				isWorldTickApiRoute: false,
			},
		);

		expect(result.units).toBe(0);
		expect(result.metadata?.method).toBe("initialize");
	});

	test("bills only actual MCP tool calls and counts batch size", async () => {
		const single = await resolveUsageMetering(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: {
						name: "context_query",
						arguments: { query: "oakrest" },
					},
				}),
			}),
			{
				isMcpRoute: true,
				isTurnsApiRoute: false,
				isInitBootstrapApiRoute: false,
				isWorldTickApiRoute: false,
			},
		);
		const batch = await resolveUsageMetering(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify([
					{
						jsonrpc: "2.0",
						id: 3,
						method: "tools/call",
						params: {
							name: "context_query",
							arguments: { query: "village" },
						},
					},
					{
						jsonrpc: "2.0",
						id: 4,
						method: "tools/call",
						params: {
							name: "state_get",
							arguments: { path: "scene/current.md" },
						},
					},
				]),
			}),
			{
				isMcpRoute: true,
				isTurnsApiRoute: false,
				isInitBootstrapApiRoute: false,
				isWorldTickApiRoute: false,
			},
		);

		expect(single.units).toBe(1);
		expect(batch.units).toBe(2);
	});

	test("still bills orchestrator API routes once per POST", async () => {
		const result = await resolveUsageMetering(
			new Request("http://localhost/api/v1/turns/resolve", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ action: "continue" }),
			}),
			{
				isMcpRoute: false,
				isTurnsApiRoute: true,
				isInitBootstrapApiRoute: false,
				isWorldTickApiRoute: false,
			},
		);

		expect(result.units).toBe(1);
		expect(result.metadata).toBeNull();
	});
});
