import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionRegistry } from "../session/session-registry";
import { maybeWrapMcpServerWithSentry } from "../telemetry/sentry";
import type { AuthContext } from "../types/contracts";
import { registerCoreResourcesAndPrompts } from "./core-capabilities";
import { registerAppendEventTool } from "./tools/append-event";
import { registerApplyDomainTransitionTool } from "./tools/apply-domain-transition";
import { registerConsistencyCheckTool } from "./tools/consistency-check";
import { registerContextQueryTool } from "./tools/context-query";
import { registerEvalRunGoldenScenariosTool } from "./tools/eval-run-golden-scenarios";
import { registerEvalRunLongCampaignStabilityTool } from "./tools/eval-run-long-campaign-stability";
import { registerInitTool } from "./tools/init";
import { registerMarkdownReadTool } from "./tools/markdown-read";
import { registerMarkdownUpsertTool } from "./tools/markdown-upsert";
import { registerMigrateLegacyStateTool } from "./tools/migrate-legacy-state";
import { registerPlayerActionTool } from "./tools/player-action";
import {
	registerEntityCrudTool,
	registerEventCrudTool,
	registerFactionCrudTool,
	registerLocationCrudTool,
} from "./tools/record-crud";
import { registerRegenerateProjectionTool } from "./tools/regenerate-projection";
import { registerReplayEventsTool } from "./tools/replay-events";
import { registerResolveMechanicsTool } from "./tools/resolve-mechanics";
import { registerRollDiceTool } from "./tools/roll-dice";
import { registerSceneTurnTool } from "./tools/scene-turn";
import { registerSessionManagementTools } from "./tools/sessions";
import { registerSimulationTickTool } from "./tools/simulation-tick";
import { registerStateGetTool } from "./tools/state-get";
import { registerStateSetTool } from "./tools/state-set";
import { registerValidateActionAgainstRulesetTool } from "./tools/validate-action-against-ruleset";
import { registerWorldStateReportTools } from "./tools/world-state-reports";
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
				"Setup workflow: call scene_turn as the primary gameplay entrypoint. If setup is incomplete, the server will auto-guide one question at a time (OpenClaw bootstrap + campaign setup) and resume pending action after completion. Setup responses include setupPrompt (v2.0); clients must render setupPrompt.prompt and setupPrompt.choices exactly as returned and must not synthesize alternative options. Query memory with context_query before major narrative decisions. For autonomous progression, use simulation_tick with idempotency keys and dryRun when evaluating outcomes. Gameplay workflow: call scene_turn for end-to-end turn resolution or player_action for lower-level action resolution. Both append canonical events, refresh derived projections, and regenerate workspace markdown reports while respecting setup preferences (for example NPC/world-generation toggles). Canon rule: do not invent persistent location/NPC names unless they are already in workspace or synchronized via tools. When narration introduces new proper names, call world_sync to persist them before reusing them. The local workspace markdown files are the primary campaign surface: projections/current-state.md, state/current.md, events/canonical.ndjson, and logs/*.md reports. Use MCP resources resource://campaign/current-summary, resource://scene/current, and resource://events/recent-digest for compact state context. Use world_state_overview, continuity_audit, timeline_diff, faction_pressure_report, npc_state_delta, player_knowledge_view, and canon_vs_inference_report when you need readable continuity reports grounded in workspace files. Use prompts run_scene_turn and generate_session_recap as workflow templates. Use validate_action_against_ruleset before resolve_mechanics for rules-safe action resolution. Use roll_dice and resolve_mechanics for authoritative mechanics resolution; both emit canonical events. Use append_event for canonical append-only events and replay_events to read event history. Use apply_domain_transition for append-only entity/location/faction transitions. Use migrate_legacy_state when converting old state/current.md campaigns into canonical events. Use eval_run_golden_scenarios for deterministic scenario regression and eval_run_long_campaign_stability for 10-25 turn campaign hardening checks. Use regenerate_projection to refresh derived projection files from canonical events. entity_crud/location_crud/faction_crud/event_crud are read/list helpers only. Use consistency_check to validate causality and references. Use sessions_list/sessions_history/sessions_send/sessions_spawn/session_status to coordinate multi-session and sub-agent workflows. markdown_upsert/state_set are restricted to non-canonical paths; use canonical tools for world state. markdown_read and state_get remain advanced read controls. All paths are relative to the authorized bardo root.",
		},
	);

	registerCoreResourcesAndPrompts(server, auth);
	registerInitTool(server, auth);
	registerContextQueryTool(server, auth);
	registerEvalRunGoldenScenariosTool(server, auth);
	registerEvalRunLongCampaignStabilityTool(server, auth);
	registerSceneTurnTool(server, auth);
	registerPlayerActionTool(server, auth);
	registerAppendEventTool(server, auth);
	registerApplyDomainTransitionTool(server, auth);
	registerReplayEventsTool(server, auth);
	registerRollDiceTool(server, auth);
	registerValidateActionAgainstRulesetTool(server, auth);
	registerResolveMechanicsTool(server, auth);
	registerRegenerateProjectionTool(server, auth);
	registerMigrateLegacyStateTool(server, auth);
	registerSimulationTickTool(server, auth);
	registerEntityCrudTool(server, auth);
	registerLocationCrudTool(server, auth);
	registerFactionCrudTool(server, auth);
	registerEventCrudTool(server, auth);
	registerConsistencyCheckTool(server, auth);
	registerWorldStateReportTools(server, auth);
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

	return maybeWrapMcpServerWithSentry(server);
}
