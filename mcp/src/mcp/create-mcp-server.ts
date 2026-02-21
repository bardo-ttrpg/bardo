import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionRegistry } from "../session/session-registry";
import type { AuthContext } from "../types/contracts";
import { registerConsistencyCheckTool } from "./tools/consistency-check";
import { registerContextQueryTool } from "./tools/context-query";
import { registerInitTool } from "./tools/init";
import { registerMarkdownReadTool } from "./tools/markdown-read";
import { registerMarkdownUpsertTool } from "./tools/markdown-upsert";
import { registerPlayerActionTool } from "./tools/player-action";
import {
	registerEntityCrudTool,
	registerEventCrudTool,
	registerFactionCrudTool,
	registerLocationCrudTool,
} from "./tools/record-crud";
import { registerSessionManagementTools } from "./tools/sessions";
import { registerSimulationTickTool } from "./tools/simulation-tick";
import { registerStateGetTool } from "./tools/state-get";
import { registerStateSetTool } from "./tools/state-set";
import { registerWorldSyncTool } from "./tools/world-sync";

export function createMcpServer(
	auth: AuthContext,
	deps?: {
		sessionRegistry?: SessionRegistry;
		getCurrentSessionId?: () => string | null;
	},
): McpServer {
	const server = new McpServer(
		{
			name: "bardo",
			title: "Bardo Filesystem Server",
			version: "1.0.0",
		},
		{
			instructions:
				"Setup workflow: call init first. It runs OpenClaw-style bootstrap (AGENTS.md/BOOTSTRAP.md/IDENTITY.md/USER.md, one question at a time via `nextPrompts`, optional SOUL.md values) and then campaign setup (preferences in `_settings/settings.md`, starting scene resolution from user input/workspace/theme-aware map). Query memory with context_query before major narrative decisions. For autonomous progression, use simulation_tick with idempotency keys and dryRun when evaluating outcomes. Gameplay workflow: call player_action with narrative action text; it updates state/history and respects init preferences (for example NPC/world-generation toggles). Canon rule: do not invent persistent location/NPC names unless they are already in workspace or synchronized via tools. When narration introduces new proper names, call world_sync to persist them before reusing them. Use entity_crud/location_crud/faction_crud/event_crud for typed canonical writes and consistency_check to validate causality and references. Use sessions_list/sessions_history/sessions_send/sessions_spawn/session_status to coordinate multi-session and sub-agent workflows. markdown_read/markdown_upsert/state_get/state_set remain advanced direct controls. All paths are relative to the authorized bardo root.",
		},
	);

	registerInitTool(server, auth);
	registerContextQueryTool(server, auth);
	registerPlayerActionTool(server, auth);
	registerSimulationTickTool(server, auth);
	registerEntityCrudTool(server, auth);
	registerLocationCrudTool(server, auth);
	registerFactionCrudTool(server, auth);
	registerEventCrudTool(server, auth);
	registerConsistencyCheckTool(server, auth);
	registerMarkdownReadTool(server, auth);
	registerMarkdownUpsertTool(server, auth);
	registerStateGetTool(server, auth);
	registerStateSetTool(server, auth);
	registerWorldSyncTool(server, auth);
	if (deps?.sessionRegistry && deps.getCurrentSessionId) {
		registerSessionManagementTools(server, auth, {
			sessionRegistry: deps.sessionRegistry,
			getCurrentSessionId: deps.getCurrentSessionId,
		});
	}

	return server;
}
