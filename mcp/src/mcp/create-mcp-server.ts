import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionRegistry } from "../session/session-registry";
import type { AuthContext } from "../types/contracts";
import { registerContextQueryTool } from "./tools/context-query";
import { registerSceneTurnTool } from "./tools/scene-turn";
import { registerWorldStateReportTools } from "./tools/world-state-reports";

export function createMcpServer(
	auth: AuthContext,
	_deps?: {
		sessionRegistry?: SessionRegistry;
		getCurrentSessionId?: () => string | null;
	},
): McpServer {
	const server = new McpServer(
		{
			name: "bardo",
			title: "Bardo Remote MCP Server",
			version: "1.0.0",
		},
		{
			instructions:
				"Use scene_turn as the primary AI GM capability. Use context_query to gather canon-backed evidence from the workspace bundle before major decisions. Use world_state_overview, continuity_audit, timeline_diff, and player_knowledge_view when you need grounded reports or drift checks over the current workspace canon. Each tool returns grounded facts, constraints, uncertainty, next steps, and write guidance so you can narrate conservatively. This remote server is intentionally tool-only and does not own the local filesystem: the local bridge supplies workspace context and applies validated write plans after successful tool execution.",
		},
	);

	registerContextQueryTool(server, auth);
	registerSceneTurnTool(server, auth);
	registerWorldStateReportTools(server, auth);

	return server;
}
