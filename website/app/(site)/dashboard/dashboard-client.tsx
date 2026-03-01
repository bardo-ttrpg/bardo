"use client";

import { useCallback, useEffect, useReducer } from "react";
import {
	CLIENT_OPTIONS,
	type ConnectionClient,
	type ConnectionMode,
	createDashboardState,
	type DashboardData,
	type DashboardKey,
	dashboardReducer,
} from "./dashboard-state";
import { DashboardSignOutButton } from "./signout-button";

const READ_REQUEST_TIMEOUT_MS =
	process.env.NODE_ENV === "development" ? 30_000 : 10_000;
const MUTATION_REQUEST_TIMEOUT_MS =
	process.env.NODE_ENV === "development" ? 90_000 : 30_000;

function formatDate(value: number | null | undefined): string {
	if (!value) return "Never";
	return new Date(value).toLocaleString();
}

async function fetchWithTimeout(
	input: RequestInfo | URL,
	init?: RequestInit,
	timeoutMs = READ_REQUEST_TIMEOUT_MS,
) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(input, {
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

function BillingPlanCard({
	billingLoading,
	billing,
	mcpPeriodLimit,
}: {
	billingLoading: boolean;
	billing: DashboardData["billing"];
	mcpPeriodLimit: number;
}) {
	return (
		<div className="border border-border p-6 lg:col-span-1">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				Billing Plan
			</p>
			{billingLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : billing ? (
				<div className="space-y-3">
					<p className="text-sm">
						Plan: <strong className="uppercase">{billing.plan}</strong>
					</p>
					<p className="text-sm">
						Credits: {billing.creditsTotal.toLocaleString()} total
					</p>
					<p className="text-sm">
						MCP calls this period:{" "}
						<strong>{billing.mcpCallsThisPeriod.toLocaleString()}</strong> /{" "}
						{mcpPeriodLimit.toLocaleString()}
					</p>
					<p className="text-sm text-muted-foreground">
						MCP calls total: {billing.mcpCallsTotal.toLocaleString()}
					</p>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					No billing profile found yet.
				</p>
			)}
		</div>
	);
}

function CreateApiKeyCard({
	name,
	onNameChange,
	onCreateKey,
	busyId,
	activeCount,
	keyPolicy,
	mutationError,
}: {
	name: string;
	onNameChange: (value: string) => void;
	onCreateKey: () => void;
	busyId: string | null;
	activeCount: number;
	keyPolicy: DashboardData["keyPolicy"];
	mutationError: string | null;
}) {
	return (
		<div className="border border-border p-6 lg:col-span-2">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				Create API Key
			</p>
			<div className="grid gap-3 sm:grid-cols-1">
				<input
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					placeholder="Key name"
					className="border border-border bg-background px-3 py-2 text-sm"
				/>
			</div>
			<button
				type="button"
				onClick={onCreateKey}
				disabled={busyId !== null}
				className="mt-4 border border-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-60"
			>
				{busyId === "create" ? "Creating..." : "Create key"}
			</button>
			<p className="mt-3 text-xs text-muted-foreground">
				Keys are shown once on create/rotate. Store them securely.
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Workspace location is managed automatically per account.
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Active keys: {activeCount} / {keyPolicy.maxAllowed}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Daily verifications (account): up to{" "}
				{keyPolicy.dailyUserVerificationLimit.toLocaleString()} / day
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Daily verifications (per key): up to{" "}
				{keyPolicy.dailyKeyVerificationLimit.toLocaleString()} / day
			</p>
			{mutationError ? (
				<p className="mt-2 text-xs text-destructive">{mutationError}</p>
			) : null}
		</div>
	);
}

function ApiKeysTable({
	keysLoading,
	keys,
	busyId,
	onRotateKey,
	onRevokeKey,
}: {
	keysLoading: boolean;
	keys: DashboardKey[];
	busyId: string | null;
	onRotateKey: (
		keyId: string,
		keyName: string,
		keyWorkspacePath: string | null,
	) => void;
	onRevokeKey: (keyId: string, keyName: string) => void;
}) {
	return (
		<div className="mt-6 border border-border">
			<div className="border-b border-border px-6 py-4">
				<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					Your API Keys
				</p>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[760px]">
					<thead>
						<tr className="border-b border-border text-left text-xs text-muted-foreground">
							<th className="px-6 py-3 font-medium">Name</th>
							<th className="px-6 py-3 font-medium">Scopes</th>
							<th className="px-6 py-3 font-medium">Status</th>
							<th className="px-6 py-3 font-medium">MCP period</th>
							<th className="px-6 py-3 font-medium">MCP total</th>
							<th className="px-6 py-3 font-medium">Workspace</th>
							<th className="px-6 py-3 font-medium">Last used</th>
							<th className="px-6 py-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{keysLoading ? (
							<tr>
								<td
									className="px-6 py-6 text-sm text-muted-foreground"
									colSpan={8}
								>
									Loading keys…
								</td>
							</tr>
						) : keys.length === 0 ? (
							<tr>
								<td
									className="px-6 py-6 text-sm text-muted-foreground"
									colSpan={8}
								>
									No keys yet. Create your first API key above.
								</td>
							</tr>
						) : (
							keys.map((key) => (
								<tr key={key.id} className="border-b border-border text-sm">
									<td className="px-6 py-3">{key.name}</td>
									<td className="px-6 py-3 font-mono text-xs">
										{key.scopes.join(",")}
									</td>
									<td className="px-6 py-3 uppercase">{key.status}</td>
									<td className="px-6 py-3 font-mono text-xs">
										{key.callsThisPeriod.toLocaleString()}
									</td>
									<td className="px-6 py-3 font-mono text-xs">
										{key.callsTotal.toLocaleString()}
									</td>
									<td className="px-6 py-3 font-mono text-xs text-muted-foreground">
										{key.workspacePath ?? "—"}
									</td>
									<td className="px-6 py-3 text-xs text-muted-foreground">
										{formatDate(key.lastUsedAt)}
									</td>
									<td className="px-6 py-3">
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												onClick={() =>
													onRotateKey(key.id, key.name, key.workspacePath)
												}
												disabled={busyId !== null || key.status === "revoked"}
												className="border border-border px-2 py-1 text-xs disabled:opacity-50"
											>
												{busyId === key.id ? "..." : "Rotate"}
											</button>
											<button
												type="button"
												onClick={() => onRevokeKey(key.id, key.name)}
												disabled={busyId !== null}
												className="border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
											>
												Delete
											</button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function ConnectionSnippetPanel({
	connectionClient,
	connectionMode,
	onClientChange,
	onModeChange,
	onGenerateSnippet,
	lastSecret,
	lastSecretLabel,
	snippet,
	snippetLoading,
	copied,
	onCopy,
}: {
	connectionClient: ConnectionClient;
	connectionMode: ConnectionMode;
	onClientChange: (value: ConnectionClient) => void;
	onModeChange: (value: ConnectionMode) => void;
	onGenerateSnippet: () => void;
	lastSecret: string | null;
	lastSecretLabel: string | null;
	snippet: string;
	snippetLoading: boolean;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<div className="mt-6 border border-border p-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				Connection Snippet Generator
			</p>
			<p className="mb-3 text-xs text-muted-foreground">
				Recommended for production right now: remote mode. Use local mode after
				publishing the Bun adapter package.
			</p>
			<div className="flex flex-wrap gap-3">
				<select
					value={connectionClient}
					onChange={(event) =>
						onClientChange(event.target.value as ConnectionClient)
					}
					className="border border-border bg-background px-3 py-2 text-sm"
				>
					{CLIENT_OPTIONS.map((client) => (
						<option key={client} value={client}>
							{client}
						</option>
					))}
				</select>
				<select
					value={connectionMode}
					onChange={(event) =>
						onModeChange(event.target.value as ConnectionMode)
					}
					className="border border-border bg-background px-3 py-2 text-sm"
				>
					<option value="remote">remote</option>
					<option value="local">local</option>
				</select>
				<button
					type="button"
					onClick={onGenerateSnippet}
					disabled={!lastSecret || snippetLoading}
					className="border border-foreground px-3 py-2 text-xs uppercase disabled:opacity-60"
				>
					{snippetLoading ? "Generating..." : "Generate snippet"}
				</button>
			</div>

			{lastSecret ? (
				<div className="mt-4 space-y-3">
					<p className="text-xs text-muted-foreground">
						{lastSecretLabel ? `${lastSecretLabel}. ` : ""}
						This secret is shown once.
					</p>
					<div className="flex items-center gap-2">
						<pre className="flex-1 overflow-x-auto border border-border bg-muted/20 p-3 font-mono text-xs">
							{lastSecret}
						</pre>
						<button
							type="button"
							onClick={onCopy}
							className="shrink-0 border border-border px-2 py-1 font-mono text-xs"
						>
							{copied ? "Copied!" : "Copy"}
						</button>
					</div>
					{snippet ? (
						<pre className="overflow-x-auto border border-border bg-muted/20 p-3 font-mono text-xs">
							{snippet}
						</pre>
					) : null}
				</div>
			) : (
				<p className="mt-4 text-xs text-muted-foreground">
					Create or rotate a key to generate a copy-ready snippet with that key.
				</p>
			)}
		</div>
	);
}

export function DashboardClient() {
	const [state, dispatch] = useReducer(
		dashboardReducer,
		undefined,
		createDashboardState,
	);

	const billing = state.dashboardData?.billing ?? null;
	const keyPolicy = state.dashboardData?.keyPolicy ?? {
		maxAllowed: 0,
		dailyUserVerificationLimit: 0,
		dailyKeyVerificationLimit: 0,
		mcpPeriodLimit: 0,
	};
	const activeCount = state.keys.filter(
		(key) => key.status === "active",
	).length;

	const loadDashboardData = useCallback(async () => {
		dispatch({ type: "dashboard_loading", billingLoading: true });
		try {
			const response = await fetchWithTimeout("/api/billing");
			if (response.ok) {
				const payload = (await response.json()) as DashboardData;
				dispatch({ type: "dashboard_loaded", dashboardData: payload });
				return;
			}
		} catch {
			// Keep existing UI state on transient network errors.
		}
		dispatch({ type: "dashboard_loading", billingLoading: false });
	}, []);

	const loadKeys = useCallback(async () => {
		dispatch({ type: "keys_loading", keysLoading: true });
		try {
			const response = await fetchWithTimeout("/api/keys");
			if (response.ok) {
				const payload = (await response.json()) as { keys: DashboardKey[] };
				dispatch({ type: "keys_loaded", keys: payload.keys ?? [] });
				return;
			}
		} catch {
			// Keep existing UI state on transient network errors.
		}
		dispatch({ type: "keys_loading", keysLoading: false });
	}, []);

	useEffect(() => {
		void loadDashboardData();
		void loadKeys();
	}, [loadDashboardData, loadKeys]);

	async function refreshSnippet(secret: string) {
		dispatch({ type: "snippet_loading", snippetLoading: true });
		try {
			const url = new URL("/api/connect/snippets", window.location.origin);
			url.searchParams.set("client", state.connectionClient);
			url.searchParams.set("mode", state.connectionMode);
			url.searchParams.set("apiKey", secret);
			const response = await fetchWithTimeout(url, { cache: "no-store" });
			const payload = (await response.json()) as { snippet?: string };
			dispatch({ type: "snippet_loaded", snippet: payload.snippet ?? "" });
		} finally {
			dispatch({ type: "snippet_loading", snippetLoading: false });
		}
	}

	async function onCreateKey() {
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
				MUTATION_REQUEST_TIMEOUT_MS,
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
				await refreshSnippet(payload.secret);
			}
			await loadKeys();
		} catch (error) {
			dispatch({
				type: "mutation_error",
				mutationError: toUiError(error, "Failed to create key"),
			});
		} finally {
			dispatch({ type: "busy_changed", busyId: null });
		}
	}

	async function onRevokeKey(keyId: string, keyName: string) {
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
				MUTATION_REQUEST_TIMEOUT_MS,
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
			await loadKeys();
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

	async function onRotateKey(
		keyId: string,
		keyName: string,
		keyWorkspacePath: string | null,
	) {
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
				MUTATION_REQUEST_TIMEOUT_MS,
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
				MUTATION_REQUEST_TIMEOUT_MS,
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
					MUTATION_REQUEST_TIMEOUT_MS,
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
				await refreshSnippet(payload.secret);
			}
			await loadKeys();
		} catch (error) {
			dispatch({
				type: "mutation_error",
				mutationError: toUiError(error, "Failed to rotate key"),
			});
		} finally {
			dispatch({ type: "busy_changed", busyId: null });
		}
	}

	function onCopySecret() {
		if (!state.lastSecret) {
			return;
		}
		navigator.clipboard.writeText(state.lastSecret);
		dispatch({ type: "copied_changed", copied: true });
		window.setTimeout(() => {
			dispatch({ type: "copied_changed", copied: false });
		}, 2_000);
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
			<div className="mb-8 flex items-center justify-between">
				<div>
					<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ API Keys + Usage
					</p>
					<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
				</div>
				<DashboardSignOutButton />
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<BillingPlanCard
					billingLoading={state.billingLoading}
					billing={billing}
					mcpPeriodLimit={keyPolicy.mcpPeriodLimit}
				/>
				<CreateApiKeyCard
					name={state.name}
					onNameChange={(name) => dispatch({ type: "name_changed", name })}
					onCreateKey={() => void onCreateKey()}
					busyId={state.busyId}
					activeCount={activeCount}
					keyPolicy={keyPolicy}
					mutationError={state.mutationError}
				/>
			</div>

			<ApiKeysTable
				keysLoading={state.keysLoading}
				keys={state.keys}
				busyId={state.busyId}
				onRotateKey={(keyId, keyName, keyWorkspacePath) =>
					void onRotateKey(keyId, keyName, keyWorkspacePath)
				}
				onRevokeKey={(keyId, keyName) => void onRevokeKey(keyId, keyName)}
			/>

			<ConnectionSnippetPanel
				connectionClient={state.connectionClient}
				connectionMode={state.connectionMode}
				onClientChange={(connectionClient) =>
					dispatch({
						type: "connection_client_changed",
						connectionClient,
					})
				}
				onModeChange={(connectionMode) =>
					dispatch({
						type: "connection_mode_changed",
						connectionMode,
					})
				}
				onGenerateSnippet={() =>
					state.lastSecret ? void refreshSnippet(state.lastSecret) : undefined
				}
				lastSecret={state.lastSecret}
				lastSecretLabel={state.lastSecretLabel}
				snippet={state.snippet}
				snippetLoading={state.snippetLoading}
				copied={state.copied}
				onCopy={onCopySecret}
			/>
		</div>
	);
}
