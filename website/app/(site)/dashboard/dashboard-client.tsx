"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardSignOutButton } from "./signout-button";

const READ_REQUEST_TIMEOUT_MS =
	process.env.NODE_ENV === "development" ? 30_000 : 10_000;
const MUTATION_REQUEST_TIMEOUT_MS =
	process.env.NODE_ENV === "development" ? 90_000 : 30_000;

type ConnectionClient =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "vscode"
	| "windsurf"
	| "generic";
type ConnectionMode = "remote" | "local";

const CLIENT_OPTIONS: readonly ConnectionClient[] = [
	"claude",
	"cursor",
	"codex",
	"vscode",
	"opencode",
	"windsurf",
	"generic",
];

type ApiKey = {
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

type DashboardData = {
	billing: BillingState | null;
	keyPolicy: {
		maxAllowed: number;
		dailyUserVerificationLimit: number;
		dailyKeyVerificationLimit: number;
		mcpPeriodLimit: number;
	};
};

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

export function DashboardClient() {
	const [dashboardData, setDashboardData] = useState<DashboardData | null>(
		null,
	);
	const [billingLoading, setBillingLoading] = useState(true);

	// Key list from Clerk (via /api/keys REST endpoint).
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [keysLoading, setKeysLoading] = useState(true);

	const [name, setName] = useState("Default key");
	const [busyId, setBusyId] = useState<string | null>(null);
	const [lastSecret, setLastSecret] = useState<string | null>(null);
	const [lastSecretLabel, setLastSecretLabel] = useState<string | null>(null);
	const [mutationError, setMutationError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [connectionClient, setConnectionClient] =
		useState<ConnectionClient>("codex");
	const [connectionMode, setConnectionMode] = useState<ConnectionMode>("local");
	const [snippet, setSnippet] = useState<string>("");
	const [snippetLoading, setSnippetLoading] = useState(false);

	const billing = dashboardData?.billing ?? null;
	const keyPolicy = dashboardData?.keyPolicy ?? {
		maxAllowed: 0,
		dailyUserVerificationLimit: 0,
		dailyKeyVerificationLimit: 0,
		mcpPeriodLimit: 0,
	};

	const activeCount = keys.filter((k) => k.status === "active").length;

	const fetchBilling = useCallback(async () => {
		setBillingLoading(true);
		try {
			const res = await fetchWithTimeout("/api/billing");
			if (res.ok) {
				const payload = (await res.json()) as DashboardData;
				setDashboardData(payload);
			}
		} catch {
			// Keep existing UI state on transient network errors.
		} finally {
			setBillingLoading(false);
		}
	}, []);

	const fetchKeys = useCallback(async () => {
		setKeysLoading(true);
		try {
			const res = await fetchWithTimeout("/api/keys");
			if (res.ok) {
				const payload = (await res.json()) as { keys: ApiKey[] };
				setKeys(payload.keys ?? []);
			}
		} catch {
			// Keep existing UI state on transient network errors.
		} finally {
			setKeysLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchBilling();
		void fetchKeys();
	}, [fetchBilling, fetchKeys]);

	async function refreshSnippet(secret: string) {
		setSnippetLoading(true);
		try {
			const url = new URL("/api/connect/snippets", window.location.origin);
			url.searchParams.set("client", connectionClient);
			url.searchParams.set("mode", connectionMode);
			url.searchParams.set("apiKey", secret);
			const response = await fetchWithTimeout(url, { cache: "no-store" });
			const payload = (await response.json()) as { snippet?: string };
			setSnippet(payload.snippet ?? "");
		} finally {
			setSnippetLoading(false);
		}
	}

	async function onCreateKey() {
		if (activeCount >= keyPolicy.maxAllowed) {
			setMutationError("You've reached your plan's API key limit");
			return;
		}
		setMutationError(null);
		setBusyId("create");
		try {
			const res = await fetchWithTimeout(
				"/api/keys",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						name,
						scopes: ["mcp"],
					}),
				},
				MUTATION_REQUEST_TIMEOUT_MS,
			);
			const payload = (await res.json()) as {
				key?: ApiKey;
				secret?: string;
				error?: string;
			};
			if (!res.ok || payload.error) {
				setMutationError(payload.error ?? "Failed to create key");
				return;
			}
			if (payload.secret) {
				setLastSecret(payload.secret);
				setLastSecretLabel(`Created ${payload.key?.name ?? name}`);
				await refreshSnippet(payload.secret);
			}
			await fetchKeys();
		} catch (err) {
			setMutationError(toUiError(err, "Failed to create key"));
		} finally {
			setBusyId(null);
		}
	}

	async function onRevokeKey(keyId: string, keyName: string) {
		setMutationError(null);
		setBusyId(keyId);
		try {
			const res = await fetchWithTimeout(
				"/api/keys/revoke",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: keyId }),
				},
				MUTATION_REQUEST_TIMEOUT_MS,
			);
			const payload = (await res.json()) as {
				revoked?: boolean;
				error?: string;
			};
			if (!res.ok || payload.error) {
				setMutationError(payload.error ?? "Failed to delete key");
				return;
			}
			await fetchKeys();
			if (lastSecretLabel?.includes(keyName)) {
				setLastSecret(null);
				setLastSecretLabel(null);
			}
		} catch (err) {
			setMutationError(toUiError(err, "Failed to delete key"));
		} finally {
			setBusyId(null);
		}
	}

	async function onRotateKey(
		keyId: string,
		keyName: string,
		keyWorkspacePath: string | null,
	) {
		setMutationError(null);
		setBusyId(keyId);
		try {
			// Clerk has no rotate primitive — revoke old and create new.
			const revokeRes = await fetchWithTimeout(
				"/api/keys/revoke",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: keyId }),
				},
				MUTATION_REQUEST_TIMEOUT_MS,
			);
			if (!revokeRes.ok) {
				const p = (await revokeRes.json()) as { error?: string };
				setMutationError(p.error ?? "Failed to delete old key during rotation");
				return;
			}
			let createRes = await fetchWithTimeout(
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
			if (!createRes.ok) {
				// Retry once on transient create failure after successful revoke.
				await sleep(350);
				createRes = await fetchWithTimeout(
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
			const payload = (await createRes.json()) as {
				key?: ApiKey;
				secret?: string;
				error?: string;
			};
			if (!createRes.ok || payload.error) {
				setMutationError(payload.error ?? "Failed to create replacement key");
				return;
			}
			if (payload.secret) {
				setLastSecret(payload.secret);
				setLastSecretLabel(`Rotated ${keyName}`);
				await refreshSnippet(payload.secret);
			}
			await fetchKeys();
		} catch (err) {
			setMutationError(toUiError(err, "Failed to rotate key"));
		} finally {
			setBusyId(null);
		}
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
								{keyPolicy.mcpPeriodLimit.toLocaleString()}
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

				<div className="border border-border p-6 lg:col-span-2">
					<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						Create API Key
					</p>
					<div className="grid gap-3 sm:grid-cols-1">
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
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
			</div>

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

			<div className="mt-6 border border-border p-6">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					Connection Snippet Generator
				</p>
				<p className="mb-3 text-xs text-muted-foreground">
					Recommended: local mode via the @bardo/mcp adapter for maximum
					compatibility across MCP clients.
				</p>
				<div className="flex flex-wrap gap-3">
					<select
						value={connectionClient}
						onChange={(event) =>
							setConnectionClient(event.target.value as ConnectionClient)
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
							setConnectionMode(event.target.value as ConnectionMode)
						}
						className="border border-border bg-background px-3 py-2 text-sm"
					>
						<option value="remote">remote</option>
						<option value="local">local</option>
					</select>
					<button
						type="button"
						onClick={() => lastSecret && refreshSnippet(lastSecret)}
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
								onClick={() => {
									navigator.clipboard.writeText(lastSecret ?? "");
									setCopied(true);
									setTimeout(() => setCopied(false), 2000);
								}}
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
						Create or rotate a key to generate a copy-ready snippet with that
						key.
					</p>
				)}
			</div>
		</div>
	);
}
