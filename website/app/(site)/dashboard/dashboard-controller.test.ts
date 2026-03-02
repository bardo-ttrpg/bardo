import { describe, expect, mock, test } from "bun:test";
import {
	copySecret,
	createKey,
	loadDashboardData,
} from "./dashboard-controller";
import {
	createDashboardState,
	type DashboardData,
	type DashboardKey,
} from "./dashboard-state";

const DASHBOARD_DATA: DashboardData = {
	billing: {
		plan: "solo",
		creditsTotal: 1_000,
		creditsUsed: 0,
		periodStart: 1,
		mcpCallsTotal: 20,
		mcpCallsThisPeriod: 10,
		apiKeyCallsTotal: 0,
		apiKeyCallsThisPeriod: 0,
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

describe("dashboard-controller", () => {
	test("loadDashboardData dispatches loading then loaded when billing succeeds", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify(DASHBOARD_DATA), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);

		await loadDashboardData({
			dispatch: (action) => actions.push(action),
			fetchImpl,
			timeoutMs: 50,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(actions).toEqual([
			{ type: "dashboard_loading", billingLoading: true },
			{ type: "dashboard_loaded", dashboardData: DASHBOARD_DATA },
		]);
	});

	test("createKey blocks locally when the plan key limit is already reached", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(async () => {
			throw new Error("fetch should not run");
		});

		await createKey({
			state: createDashboardState(),
			activeCount: DASHBOARD_DATA.keyPolicy.maxAllowed,
			keyPolicy: DASHBOARD_DATA.keyPolicy,
			dispatch: (action) => actions.push(action),
			fetchImpl,
			loadKeys: async () => {
				throw new Error("loadKeys should not run");
			},
			refreshSnippet: async () => {
				throw new Error("refreshSnippet should not run");
			},
			timeoutMs: 50,
		});

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(actions).toEqual([
			{
				type: "mutation_error",
				mutationError: "You've reached your plan's API key limit",
			},
		]);
	});

	test("copySecret writes the current secret and schedules the copied state reset", async () => {
		const actions: unknown[] = [];
		const clipboard = {
			writeText: mock(async () => undefined),
		};
		let resetCallback: (() => void) | null = null;
		let resetDelayMs = 0;

		await copySecret({
			secret: "secret-value",
			dispatch: (action) => actions.push(action),
			clipboard,
			scheduleReset: (callback, delayMs) => {
				resetCallback = callback;
				resetDelayMs = delayMs;
				return 1;
			},
		});

		expect(clipboard.writeText).toHaveBeenCalledWith("secret-value");
		expect(actions).toEqual([{ type: "copied_changed", copied: true }]);
		expect(resetDelayMs).toBe(2_000);

		resetCallback?.();

		expect(actions).toEqual([
			{ type: "copied_changed", copied: true },
			{ type: "copied_changed", copied: false },
		]);
	});

	test("createKey refreshes snippets and reloads keys after a successful create", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(
			async () =>
				new Response(
					JSON.stringify({
						key: DASHBOARD_KEY,
						secret: "secret-value",
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		);
		const refreshSnippet = mock(async () => undefined);
		const loadKeys = mock(async () => undefined);

		await createKey({
			state: {
				...createDashboardState(),
				name: "Primary",
			},
			activeCount: 0,
			keyPolicy: DASHBOARD_DATA.keyPolicy,
			dispatch: (action) => actions.push(action),
			fetchImpl,
			loadKeys,
			refreshSnippet,
			timeoutMs: 50,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(refreshSnippet).toHaveBeenCalledWith("secret-value");
		expect(loadKeys).toHaveBeenCalledTimes(1);
		expect(actions).toContainEqual({
			type: "secret_received",
			secret: "secret-value",
			label: "Created Primary",
		});
		expect(actions.at(-1)).toEqual({ type: "busy_changed", busyId: null });
	});
});
