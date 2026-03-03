export type ConnectionClient =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "vscode"
	| "windsurf"
	| "generic";

export type ConnectionMode = "remote" | "local";

export const CLIENT_OPTIONS: readonly ConnectionClient[] = [
	"claude",
	"cursor",
	"codex",
	"vscode",
	"opencode",
	"windsurf",
	"generic",
];

export type DashboardKey = {
	id: string;
	name: string;
	status: string;
	scopes: string[];
	createdAt: number;
	workspacePath: string | null;
	callsTotal: number;
	callsThisPeriod: number;
	lastUsedAt: number | null;
	lastUsedProviderId: string | null;
	lastUsedModelId: string | null;
};

type BillingState = {
	plan: string;
	creditsTotal: number;
	creditsUsed: number;
	periodStart: number;
	mcpCallsTotal: number;
	mcpCallsThisPeriod: number;
	apiKeyCallsTotal: number;
	apiKeyCallsThisPeriod: number;
};

export type DashboardData = {
	billing: BillingState | null;
	keyPolicy: {
		maxAllowed: number;
		dailyUserVerificationLimit: number;
		dailyKeyVerificationLimit: number;
		mcpPeriodLimit: number;
	};
};

export type DashboardState = {
	dashboardData: DashboardData | null;
	billingLoading: boolean;
	keys: DashboardKey[];
	keysLoading: boolean;
	name: string;
	busyId: string | null;
	lastSecret: string | null;
	lastSecretLabel: string | null;
	mutationError: string | null;
	copied: boolean;
	connectionClient: ConnectionClient;
	connectionMode: ConnectionMode;
	snippet: string;
	snippetLoading: boolean;
	cliLoginCommand: string;
	cliLoginLoading: boolean;
};

export type DashboardAction =
	| { type: "dashboard_loading"; billingLoading: boolean }
	| { type: "dashboard_loaded"; dashboardData: DashboardData | null }
	| { type: "keys_loading"; keysLoading: boolean }
	| { type: "keys_loaded"; keys: DashboardKey[] }
	| { type: "name_changed"; name: string }
	| { type: "busy_changed"; busyId: string | null }
	| { type: "mutation_error"; mutationError: string | null }
	| { type: "secret_received"; secret: string; label: string }
	| { type: "key_deleted"; keyName: string }
	| { type: "copied_changed"; copied: boolean }
	| { type: "connection_client_changed"; connectionClient: ConnectionClient }
	| { type: "connection_mode_changed"; connectionMode: ConnectionMode }
	| { type: "snippet_loading"; snippetLoading: boolean }
	| { type: "snippet_loaded"; snippet: string }
	| { type: "cli_login_loading"; cliLoginLoading: boolean }
	| { type: "cli_login_command_loaded"; cliLoginCommand: string };

export function createDashboardState(): DashboardState {
	return {
		dashboardData: null,
		billingLoading: true,
		keys: [],
		keysLoading: true,
		name: "Default key",
		busyId: null,
		lastSecret: null,
		lastSecretLabel: null,
		mutationError: null,
		copied: false,
		connectionClient: "codex",
		connectionMode: "local",
		snippet: "",
		snippetLoading: false,
		cliLoginCommand: "",
		cliLoginLoading: false,
	};
}

export function dashboardReducer(
	state: DashboardState,
	action: DashboardAction,
): DashboardState {
	switch (action.type) {
		case "dashboard_loading":
			return {
				...state,
				billingLoading: action.billingLoading,
			};
		case "dashboard_loaded":
			return {
				...state,
				dashboardData: action.dashboardData,
				billingLoading: false,
			};
		case "keys_loading":
			return {
				...state,
				keysLoading: action.keysLoading,
			};
		case "keys_loaded":
			return {
				...state,
				keys: action.keys,
				keysLoading: false,
			};
		case "name_changed":
			return {
				...state,
				name: action.name,
			};
		case "busy_changed":
			return {
				...state,
				busyId: action.busyId,
			};
		case "mutation_error":
			return {
				...state,
				mutationError: action.mutationError,
			};
		case "secret_received":
			return {
				...state,
				lastSecret: action.secret,
				lastSecretLabel: action.label,
				copied: false,
			};
		case "key_deleted":
			if (!state.lastSecretLabel?.includes(action.keyName)) {
				return state;
			}
			return {
				...state,
				lastSecret: null,
				lastSecretLabel: null,
			};
		case "copied_changed":
			return {
				...state,
				copied: action.copied,
			};
		case "connection_client_changed":
			return {
				...state,
				connectionClient: action.connectionClient,
			};
		case "connection_mode_changed":
			return {
				...state,
				connectionMode: action.connectionMode,
			};
		case "snippet_loading":
			return {
				...state,
				snippetLoading: action.snippetLoading,
			};
		case "snippet_loaded":
			return {
				...state,
				snippet: action.snippet,
				snippetLoading: false,
			};
		case "cli_login_loading":
			return {
				...state,
				cliLoginLoading: action.cliLoginLoading,
			};
		case "cli_login_command_loaded":
			return {
				...state,
				cliLoginCommand: action.cliLoginCommand,
				copied: false,
				cliLoginLoading: false,
			};
		default:
			return state;
	}
}
