import { describe, expect, test } from "bun:test";
import {
	createDashboardState,
	type DashboardData,
	type DashboardKey,
	dashboardReducer,
} from "./dashboard-state";

const DASHBOARD_DATA: DashboardData = {
	billing: {
		plan: "solo",
		creditsTotal: 1_000,
		creditsUsed: 0,
		creditsRemaining: 1_000,
		periodStart: 1,
		mcpCallsTotal: 20,
		mcpCallsThisPeriod: 10,
		subscriptionStatus: "active",
		subscriptionId: "sub_123",
		billingInterval: "month",
		currentPeriodEnd: 2,
		cancelAtPeriodEnd: false,
	},
	keyPolicy: {
		maxAllowed: 3,
		dailyUserVerificationLimit: 100,
		dailyKeyVerificationLimit: 50,
		mcpPeriodLimit: 1_000,
	},
};

const DASHBOARD_KEY: DashboardKey = {
	id: "key_1",
	name: "Primary",
	status: "active",
	scopes: ["mcp"],
	createdAt: 1,
	workspacePath: "./customers/user_1",
	callsTotal: 20,
	callsThisPeriod: 10,
	lastUsedAt: null,
	lastUsedProviderId: null,
	lastUsedModelId: null,
};

describe("dashboardReducer", () => {
	test("updates the dashboard data and loading state together", () => {
		const state = createDashboardState();

		const next = dashboardReducer(state, {
			type: "dashboard_loaded",
			dashboardData: DASHBOARD_DATA,
		});

		expect(next.dashboardData).toEqual(DASHBOARD_DATA);
		expect(next.billingLoading).toBe(false);
	});

	test("stores a newly created secret and clears copy state", () => {
		const state = {
			...createDashboardState(),
			copied: true,
		};

		const next = dashboardReducer(state, {
			type: "secret_received",
			secret: "secret-value",
			label: "Created Primary",
		});

		expect(next.lastSecret).toBe("secret-value");
		expect(next.lastSecretLabel).toBe("Created Primary");
		expect(next.copied).toBe(false);
	});

	test("clears the last secret when the rotated key label matches a deleted key", () => {
		const state = {
			...createDashboardState(),
			lastSecret: "secret-value",
			lastSecretLabel: "Rotated Primary",
		};

		const next = dashboardReducer(state, {
			type: "key_deleted",
			keyName: "Primary",
		});

		expect(next.lastSecret).toBeNull();
		expect(next.lastSecretLabel).toBeNull();
	});

	test("tracks key list loading and payload updates independently", () => {
		const loadingState = dashboardReducer(createDashboardState(), {
			type: "keys_loading",
			keysLoading: true,
		});

		const next = dashboardReducer(loadingState, {
			type: "keys_loaded",
			keys: [DASHBOARD_KEY],
			hasMore: true,
			nextOffset: 20,
			append: false,
		});

		expect(next.keysLoading).toBe(false);
		expect(next.keys).toEqual([DASHBOARD_KEY]);
		expect(next.keysHasMore).toBe(true);
		expect(next.keysNextOffset).toBe(20);
	});

	test("appends keys when loading additional pages", () => {
		const state = {
			...createDashboardState(),
			keys: [DASHBOARD_KEY],
			keysHasMore: true,
			keysNextOffset: 20,
		};

		const next = dashboardReducer(state, {
			type: "keys_loaded",
			keys: [
				{
					...DASHBOARD_KEY,
					id: "key_2",
					name: "Secondary",
				},
			],
			hasMore: false,
			nextOffset: null,
			append: true,
		});

		expect(next.keys).toEqual([
			DASHBOARD_KEY,
			{
				...DASHBOARD_KEY,
				id: "key_2",
				name: "Secondary",
			},
		]);
		expect(next.keysHasMore).toBe(false);
		expect(next.keysNextOffset).toBeNull();
	});

	test("stores the generated CLI login command and clears copy state", () => {
		const state = {
			...createDashboardState(),
			copied: true,
		};

		const next = dashboardReducer(state, {
			type: "cli_login_command_loaded",
			cliLoginCommand:
				'bardo login --token "cli_token" --exchange-url "https://app.bardo.ai/api/connect/cli-exchange"',
		});

		expect(next.cliLoginCommand).toContain("bardo login --token");
		expect(next.copied).toBe(false);
	});
});
