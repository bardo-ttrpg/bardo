import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerInitTool } from "../tools/init";
import { registerMarkdownReadTool } from "../tools/markdown-read";
import { registerMarkdownUpsertTool } from "../tools/markdown-upsert";
import { registerPlayerActionTool } from "../tools/player-action";
import { registerStateGetTool } from "../tools/state-get";
import { registerStateSetTool } from "../tools/state-set";
import { registerWorldSyncTool } from "../tools/world-sync";
import type { AuthContext } from "../types";

export function createServer(auth: AuthContext): McpServer {
	const server = new McpServer(
		{
			name: "bardo",
			title: "Bardo Filesystem Server",
			version: "1.0.0",
		},
		{
			instructions:
				"Setup workflow: call init first. It prepares folders, saves preferences in `_settings/settings.md` (dice roller, theme, optional non-core systems), and ensures a starting scene using user input, workspace content, or theme-aware map generation. If init returns `requiresUserInput=true`, ask `nextPrompts` before gameplay. Gameplay workflow: call player_action with narrative action text; it updates state/history and respects init preferences (for example NPC/world-generation toggles). Canon rule: do not invent persistent location/NPC names unless they are already in workspace or synchronized via tools. When narration introduces new proper names, call world_sync to persist them before reusing them. markdown_read/markdown_upsert/state_get/state_set are advanced direct controls. All paths are relative to the authorized bardo root.",
		},
	);

	registerInitTool(server, auth);
	registerPlayerActionTool(server, auth);
	registerMarkdownReadTool(server, auth);
	registerMarkdownUpsertTool(server, auth);
	registerStateGetTool(server, auth);
	registerStateSetTool(server, auth);
	registerWorldSyncTool(server, auth);

	return server;
}
