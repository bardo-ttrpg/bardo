"use client";

import type {
	ConnectionClient,
	ConnectionMode,
	DashboardAction,
	DashboardData,
	DashboardKey,
	DashboardState,
} from "./dashboard-state";

const READ_REQUEST_TIMEOUT_MS =
	process.env.NODE_ENV === "development" ? 30_000 : 10_000;
const MUTATION_REQUEST_TIMEOUT_MS =
	process.env.NODE_ENV === "development" ? 90_000 : 30_000;

type DashboardDispatch = (action: DashboardAction) => void;

type FetchWithTimeoutArgs = {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
};

type KeyPolicy = DashboardData["keyPolicy"];

type LoadDashboardDataArgs = FetchWithTimeoutArgs & {
	dispatch: DashboardDispatch;
};

type LoadKeysArgs = FetchWithTimeoutArgs & {
	dispatch: DashboardDispatch;
};

type RefreshSnippetArgs = FetchWithTimeoutArgs & {
	dispatch: DashboardDispatch;
	connectionClient: ConnectionClient;
	connectionMode: ConnectionMode;
	secret: string;
	origin?: string;
};

type CreateKeyArgs = FetchWithTimeoutArgs & {
	state: DashboardState;
	activeCount: number;
	keyPolicy: KeyPolicy;
	dispatch: DashboardDispatch;
	loadKeys: () => Promise<void>;
	refreshSnippet: (secret: string) => Promise<void>;
};

type RevokeKeyArgs = FetchWithTimeoutArgs & {
	keyId: string;
	keyName: string;
	dispatch: DashboardDispatch;
	loadKeys: () => Promise<void>;
};

type RotateKeyArgs = FetchWithTimeoutArgs & {
	keyId: string;
	keyName: string;
	keyWorkspacePath: string | null;
	dispatch: DashboardDispatch;
	loadKeys: () => Promise<void>;
	refreshSnippet: (secret: string) => Promise<void>;
};

type CopySecretArgs = {
	secret: string | null;
	dispatch: DashboardDispatch;
	clipboard?: Pick<Clipboard, "writeText">;
	scheduleReset?: (callback: () => void, delayMs: number) => unknown;
};

type GenerateCliLoginCommandArgs = FetchWithTimeoutArgs & {
	dispatch: DashboardDispatch;
};

type DashboardViewModel = {
	billing: DashboardData["billing"];
	keyPolicy: KeyPolicy;
	activeCount: number;
};

async function fetchWithTimeout(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	options: FetchWithTimeoutArgs,
) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? READ_REQUEST_TIMEOUT_MS,
	);
	try {
		return await (options.fetchImpl ?? fetch)(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCliLoginCommand(args: {
	loginToken: string;
	exchangeUrl: string;
}): string {
	return `bardo login --token "${args.loginToken}" --exchange-url "${args.exchangeUrl}"`;
}

function toUiError(error: unknown, fallback: string): string {
	if (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	) {
		return "Request timed out. Please retry.";
	}
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return fallback;
}

export function getDashboardViewModel(
	state: DashboardState,
): DashboardViewModel {
	return {
		billing: state.dashboardData?.billing ?? null,
		keyPolicy: state.dashboardData?.keyPolicy ?? {
			maxAllowed: 0,
			dailyUserVerificationLimit: 0,
			dailyKeyVerificationLimit: 0,
			mcpPeriodLimit: 0,
		},
		activeCount: state.keys.filter((key) => key.status === "active").length,
	};
}

export async function loadDashboardData({
	dispatch,
	...fetchOptions
}: LoadDashboardDataArgs): Promise<void> {
	dispatch({ type: "dashboard_loading", billingLoading: true });
	try {
		const response = await fetchWithTimeout(
			"/api/billing",
			undefined,
			fetchOptions,
		);
		if (response.ok) {
			const payload = (await response.json()) as DashboardData;
			dispatch({ type: "dashboard_loaded", dashboardData: payload });
			return;
		}
	} catch {
		// Keep existing UI state on transient network errors.
	}
	dispatch({ type: "dashboard_loading", billingLoading: false });
}

export async function loadKeys({
	dispatch,
	...fetchOptions
}: LoadKeysArgs): Promise<void> {
	dispatch({ type: "keys_loading", keysLoading: true });
	try {
		const response = await fetchWithTimeout(
			"/api/keys",
			undefined,
			fetchOptions,
		);
		if (response.ok) {
			const payload = (await response.json()) as { keys: DashboardKey[] };
			dispatch({ type: "keys_loaded", keys: payload.keys ?? [] });
			return;
		}
	} catch {
		// Keep existing UI state on transient network errors.
	}
	dispatch({ type: "keys_loading", keysLoading: false });
}

export async function refreshSnippet({
	dispatch,
	connectionClient,
	connectionMode,
	secret,
	origin,
	...fetchOptions
}: RefreshSnippetArgs): Promise<void> {
	dispatch({ type: "snippet_loading", snippetLoading: true });
	try {
		const url = new URL(
			"/api/connect/snippets",
			origin ?? window.location.origin,
		);
		url.searchParams.set("client", connectionClient);
		url.searchParams.set("mode", connectionMode);
		url.searchParams.set("apiKey", secret);
		const response = await fetchWithTimeout(
			url,
			{ cache: "no-store" },
			fetchOptions,
		);
		const payload = (await response.json()) as { snippet?: string };
		dispatch({ type: "snippet_loaded", snippet: payload.snippet ?? "" });
	} finally {
		dispatch({ type: "snippet_loading", snippetLoading: false });
	}
}

export async function generateCliLoginCommand({
	dispatch,
	...fetchOptions
}: GenerateCliLoginCommandArgs): Promise<void> {
	dispatch({ type: "cli_login_loading", cliLoginLoading: true });
	try {
		const response = await fetchWithTimeout(
			"/api/connect/cli-token",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			},
			{
				...fetchOptions,
				timeoutMs: MUTATION_REQUEST_TIMEOUT_MS,
			},
		);
		const payload = (await response.json()) as {
			loginToken?: string;
			exchangeUrl?: string;
			error?: string;
		};
		if (
			!response.ok ||
			typeof payload.loginToken !== "string" ||
			typeof payload.exchangeUrl !== "string"
		) {
			dispatch({
				type: "mutation_error",
				mutationError: payload.error ?? "Failed to generate CLI login command",
			});
			return;
		}

		dispatch({
			type: "mutation_error",
			mutationError: null,
		});
		dispatch({
			type: "cli_login_command_loaded",
			cliLoginCommand: buildCliLoginCommand({
				loginToken: payload.loginToken,
				exchangeUrl: payload.exchangeUrl,
			}),
		});
	} catch (error) {
		dispatch({
			type: "mutation_error",
			mutationError: toUiError(error, "Failed to generate CLI login command"),
		});
	} finally {
		dispatch({ type: "cli_login_loading", cliLoginLoading: false });
	}
}

export async function createKey({
	state,
	activeCount,
	keyPolicy,
	dispatch,
	loadKeys: loadKeysCallback,
	refreshSnippet: refreshSnippetCallback,
	timeoutMs = MUTATION_REQUEST_TIMEOUT_MS,
	...fetchOptions
}: CreateKeyArgs): Promise<void> {
	if (activeCount >= keyPolicy.maxAllowed) {
		dispatch({
			type: "mutation_error",
			mutationError: "You've reached your plan's API key limit",
		});
		return;
	}
	dispatch({ type: "mutation_error", mutationError: null });
	dispatch({ type: "busy_changed", busyId: "create" });
	try {
		const response = await fetchWithTimeout(
			"/api/keys",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: state.name,
					scopes: ["mcp"],
				}),
			},
			{ ...fetchOptions, timeoutMs },
		);
		const payload = (await response.json()) as {
			key?: DashboardKey;
			secret?: string;
			error?: string;
		};
		if (!response.ok || payload.error) {
			dispatch({
				type: "mutation_error",
				mutationError: payload.error ?? "Failed to create key",
			});
			return;
		}
		if (payload.secret) {
			dispatch({
				type: "secret_received",
				secret: payload.secret,
				label: `Created ${payload.key?.name ?? state.name}`,
			});
			await refreshSnippetCallback(payload.secret);
		}
		await loadKeysCallback();
	} catch (error) {
		dispatch({
			type: "mutation_error",
			mutationError: toUiError(error, "Failed to create key"),
		});
	} finally {
		dispatch({ type: "busy_changed", busyId: null });
	}
}

export async function revokeKey({
	keyId,
	keyName,
	dispatch,
	loadKeys: loadKeysCallback,
	timeoutMs = MUTATION_REQUEST_TIMEOUT_MS,
	...fetchOptions
}: RevokeKeyArgs): Promise<void> {
	dispatch({ type: "mutation_error", mutationError: null });
	dispatch({ type: "busy_changed", busyId: keyId });
	try {
		const response = await fetchWithTimeout(
			"/api/keys/revoke",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: keyId }),
			},
			{ ...fetchOptions, timeoutMs },
		);
		const payload = (await response.json()) as {
			revoked?: boolean;
			error?: string;
		};
		if (!response.ok || payload.error) {
			dispatch({
				type: "mutation_error",
				mutationError: payload.error ?? "Failed to delete key",
			});
			return;
		}
		await loadKeysCallback();
		dispatch({ type: "key_deleted", keyName });
	} catch (error) {
		dispatch({
			type: "mutation_error",
			mutationError: toUiError(error, "Failed to delete key"),
		});
	} finally {
		dispatch({ type: "busy_changed", busyId: null });
	}
}

export async function rotateKey({
	keyId,
	keyName,
	keyWorkspacePath,
	dispatch,
	loadKeys: loadKeysCallback,
	refreshSnippet: refreshSnippetCallback,
	timeoutMs = MUTATION_REQUEST_TIMEOUT_MS,
	...fetchOptions
}: RotateKeyArgs): Promise<void> {
	dispatch({ type: "mutation_error", mutationError: null });
	dispatch({ type: "busy_changed", busyId: keyId });
	try {
		const revokeResponse = await fetchWithTimeout(
			"/api/keys/revoke",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: keyId }),
			},
			{ ...fetchOptions, timeoutMs },
		);
		if (!revokeResponse.ok) {
			const payload = (await revokeResponse.json()) as { error?: string };
			dispatch({
				type: "mutation_error",
				mutationError:
					payload.error ?? "Failed to delete old key during rotation",
			});
			return;
		}

		let createResponse = await fetchWithTimeout(
			"/api/keys",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: keyName,
					workspacePath: keyWorkspacePath ?? undefined,
					scopes: ["mcp"],
				}),
			},
			{ ...fetchOptions, timeoutMs },
		);
		if (!createResponse.ok) {
			await sleep(350);
			createResponse = await fetchWithTimeout(
				"/api/keys",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						name: keyName,
						workspacePath: keyWorkspacePath ?? undefined,
						scopes: ["mcp"],
					}),
				},
				{ ...fetchOptions, timeoutMs },
			);
		}

		const payload = (await createResponse.json()) as {
			key?: DashboardKey;
			secret?: string;
			error?: string;
		};
		if (!createResponse.ok || payload.error) {
			dispatch({
				type: "mutation_error",
				mutationError: payload.error ?? "Failed to create replacement key",
			});
			return;
		}
		if (payload.secret) {
			dispatch({
				type: "secret_received",
				secret: payload.secret,
				label: `Rotated ${keyName}`,
			});
			await refreshSnippetCallback(payload.secret);
		}
		await loadKeysCallback();
	} catch (error) {
		dispatch({
			type: "mutation_error",
			mutationError: toUiError(error, "Failed to rotate key"),
		});
	} finally {
		dispatch({ type: "busy_changed", busyId: null });
	}
}

export async function copySecret({
	secret,
	dispatch,
	clipboard = navigator.clipboard,
	scheduleReset = window.setTimeout,
}: CopySecretArgs): Promise<void> {
	if (!secret) {
		return;
	}
	await clipboard.writeText(secret);
	dispatch({ type: "copied_changed", copied: true });
	scheduleReset(() => {
		dispatch({ type: "copied_changed", copied: false });
	}, 2_000);
}
