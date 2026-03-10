import { describe, expect, mock, test } from "bun:test";
import {
	copySecret,
	createKey,
	generateCliLoginCommand,
	loadDashboardData,
	loadKeys,
	refreshSnippet,
	revokeKey,
	rotateKey,
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

	test("loadKeys stores page metadata and supports incremental loading", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), "https://app.bardo.ai");
			expect(url.pathname).toBe("/api/keys");
			expect(url.searchParams.get("limit")).toBe("20");
			expect(url.searchParams.get("offset")).toBe("20");

			return new Response(
				JSON.stringify({
					keys: [DASHBOARD_KEY],
					page: {
						limit: 20,
						offset: 20,
						totalCount: 21,
						hasMore: true,
						nextOffset: 40,
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});

		await loadKeys({
			dispatch: (action) => actions.push(action),
			fetchImpl,
			timeoutMs: 50,
			offset: 20,
			append: true,
		});

		expect(actions).toEqual([
			{ type: "keys_loading", keysLoading: true },
			{
				type: "keys_loaded",
				keys: [DASHBOARD_KEY],
				hasMore: true,
				nextOffset: 40,
				append: true,
			},
		]);
	});

	test("generateCliLoginCommand loads a copy-ready bardo login command", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(
			async () =>
				new Response(
					JSON.stringify({
						loginToken: "cli_token_123",
						exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		);

		await generateCliLoginCommand({
			activeCount: 0,
			keyPolicy: DASHBOARD_DATA.keyPolicy,
			dispatch: (action) => actions.push(action),
			fetchImpl,
			timeoutMs: 50,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(actions).toEqual([
			{ type: "cli_login_loading", cliLoginLoading: true },
			{ type: "mutation_error", mutationError: null },
			{
				type: "cli_login_command_loaded",
				cliLoginCommand:
					'bardo login --token "cli_token_123" --exchange-url "https://app.bardo.ai/api/connect/cli-exchange"',
			},
			{ type: "cli_login_loading", cliLoginLoading: false },
		]);
	});

	test("generateCliLoginCommand surfaces exchange errors", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ error: "Key limit reached" }), {
					status: 403,
					headers: { "content-type": "application/json" },
				}),
		);

		await generateCliLoginCommand({
			activeCount: 0,
			keyPolicy: DASHBOARD_DATA.keyPolicy,
			dispatch: (action) => actions.push(action),
			fetchImpl,
			timeoutMs: 50,
		});

		expect(actions).toEqual([
			{ type: "cli_login_loading", cliLoginLoading: true },
			{
				type: "mutation_error",
				mutationError: "Key limit reached",
			},
			{ type: "cli_login_loading", cliLoginLoading: false },
		]);
	});

	test("generateCliLoginCommand blocks locally when no API key slot is available", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(async () => {
			throw new Error("fetch should not run");
		});

		await generateCliLoginCommand({
			activeCount: DASHBOARD_DATA.keyPolicy.maxAllowed,
			keyPolicy: DASHBOARD_DATA.keyPolicy,
			dispatch: (action) => actions.push(action),
			fetchImpl,
			timeoutMs: 50,
		});

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(actions).toEqual([
			{
				type: "mutation_error",
				mutationError:
					"CLI login needs a free API key slot on your current plan. Rotate or delete an existing key, then retry.",
			},
		]);
	});

	test("refreshSnippet sends the secret in the request body instead of the URL", async () => {
		const actions: unknown[] = [];
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input));
				expect(url.pathname).toBe("/api/connect/snippets");
				expect(url.searchParams.get("client")).toBeNull();
				expect(url.searchParams.get("mode")).toBeNull();
				expect(url.searchParams.get("apiKey")).toBeNull();
				expect(init?.method).toBe("POST");
				expect(init?.headers).toEqual({ "content-type": "application/json" });
				expect(init?.body).toBe(
					JSON.stringify({
						client: "claude",
						mode: "local",
						apiKey: "secret-value",
					}),
				);

				return new Response(JSON.stringify({ snippet: "snippet-value" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);

		await refreshSnippet({
			dispatch: (action) => actions.push(action),
			connectionClient: "claude",
			connectionMode: "local",
			secret: "secret-value",
			origin: "https://app.bardo.ai",
			fetchImpl,
			timeoutMs: 50,
		});

		expect(actions).toEqual([
			{ type: "snippet_loading", snippetLoading: true },
			{ type: "snippet_loaded", snippet: "snippet-value" },
			{ type: "snippet_loading", snippetLoading: false },
		]);
	});

	test("revokeKey uses DELETE /api/keys/:id and dispatches key_deleted after reload", async () => {
		const actions: unknown[] = [];
		const loadKeys = mock(async () => undefined);
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input), "https://app.bardo.ai");
				expect(url.pathname).toBe("/api/keys/key_1");
				expect(init?.method).toBe("DELETE");
				expect(init?.body).toBeUndefined();
				return new Response(JSON.stringify({ revoked: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);

		await revokeKey({
			keyId: "key_1",
			keyName: "Primary",
			dispatch: (action) => actions.push(action),
			loadKeys,
			fetchImpl,
			timeoutMs: 50,
		});

		expect(loadKeys).toHaveBeenCalledTimes(1);
		expect(actions).toContainEqual({ type: "key_deleted", keyName: "Primary" });
	});

	test("rotateKey revokes through DELETE /api/keys/:id before creating replacement key", async () => {
		const actions: unknown[] = [];
		const loadKeys = mock(async () => undefined);
		const refreshSnippet = mock(async () => undefined);
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input), "https://app.bardo.ai");
				if (url.pathname === "/api/keys/key_1") {
					expect(init?.method).toBe("DELETE");
					return new Response(JSON.stringify({ revoked: true }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.pathname === "/api/keys") {
					expect(init?.method).toBe("POST");
					return new Response(
						JSON.stringify({
							key: { ...DASHBOARD_KEY, id: "key_2" },
							secret: "replacement-secret",
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					);
				}
				throw new Error(`Unexpected route: ${url.pathname}`);
			},
		);

		await rotateKey({
			keyId: "key_1",
			keyName: "Primary",
			keyWorkspacePath: "./customers/user_1",
			dispatch: (action) => actions.push(action),
			loadKeys,
			refreshSnippet,
			fetchImpl,
			timeoutMs: 50,
		});

		expect(loadKeys).toHaveBeenCalledTimes(1);
		expect(refreshSnippet).toHaveBeenCalledWith("replacement-secret");
		expect(actions).toContainEqual({
			type: "secret_received",
			secret: "replacement-secret",
			label: "Rotated Primary",
		});
	});
});
