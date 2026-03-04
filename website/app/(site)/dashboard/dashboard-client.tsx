"use client";

import { useEffect, useReducer } from "react";
import {
	copySecret,
	createKey,
	generateCliLoginCommand,
	getDashboardViewModel,
	loadDashboardData,
	loadKeys,
	refreshSnippet,
	revokeKey,
	rotateKey,
} from "./dashboard-controller";
import {
	CLIENT_OPTIONS,
	type ConnectionClient,
	type ConnectionMode,
	createDashboardState,
	type DashboardData,
	type DashboardKey,
	dashboardReducer,
	getDashboardClientLabel,
	getDashboardClientMetadata,
} from "./dashboard-state";
import { DashboardSignOutButton } from "./signout-button";

function formatDate(value: number | null | undefined): string {
	if (!value) return "Never";
	return new Date(value).toLocaleString();
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
						Billable MCP tool calls this period:{" "}
						<strong>{billing.mcpCallsThisPeriod.toLocaleString()}</strong> /{" "}
						{mcpPeriodLimit.toLocaleString()}
					</p>
					<p className="text-sm text-muted-foreground">
						Billable MCP tool calls total:{" "}
						{billing.mcpCallsTotal.toLocaleString()}
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
				Hosted staging and production workspaces live on the MCP server, not in
				your local editor folder.
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

export function ApiKeysTable({
	keysLoading,
	keys,
	keysHasMore,
	busyId,
	onRotateKey,
	onRevokeKey,
	onLoadMore,
}: {
	keysLoading: boolean;
	keys: DashboardKey[];
	keysHasMore: boolean;
	busyId: string | null;
	onRotateKey: (
		keyId: string,
		keyName: string,
		keyWorkspacePath: string | null,
	) => void;
	onRevokeKey: (keyId: string, keyName: string) => void;
	onLoadMore: () => void;
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
			{!keysLoading && keysHasMore ? (
				<div className="border-t border-border px-6 py-4">
					<button
						type="button"
						onClick={onLoadMore}
						className="border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest"
					>
						Load more keys
					</button>
				</div>
			) : null}
		</div>
	);
}

export function ConnectionSnippetPanel({
	connectionClient,
	connectionMode,
	onClientChange,
	onModeChange,
	onGenerateSnippet,
	onGenerateCliLoginCommand,
	lastSecret,
	lastSecretLabel,
	snippet,
	snippetLoading,
	cliLoginCommand,
	cliLoginLoading,
	copied,
	onCopy,
}: {
	connectionClient: ConnectionClient;
	connectionMode: ConnectionMode;
	onClientChange: (value: ConnectionClient) => void;
	onModeChange: (value: ConnectionMode) => void;
	onGenerateSnippet: () => void;
	onGenerateCliLoginCommand: () => void;
	lastSecret: string | null;
	lastSecretLabel: string | null;
	snippet: string;
	snippetLoading: boolean;
	cliLoginCommand: string;
	cliLoginLoading: boolean;
	copied: boolean;
	onCopy: () => void;
}) {
	const selectedClient = getDashboardClientMetadata(connectionClient);

	return (
		<div className="mt-6 border border-border p-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				Connection Snippet Generator
			</p>
			<p className="mb-3 text-xs text-muted-foreground">
				Remote mode connects your client straight to the Railway MCP. Local mode
				runs a tiny Bun adapter on your machine, but with the current hosted
				setup the workspace still lives on the MCP server unless workspace
				overrides are explicitly enabled.
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
							{getDashboardClientLabel(client)}
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
				<button
					type="button"
					onClick={onGenerateCliLoginCommand}
					disabled={cliLoginLoading}
					className="border border-border px-3 py-2 text-xs uppercase disabled:opacity-60"
				>
					{cliLoginLoading ? "Generating..." : "Generate CLI Login"}
				</button>
			</div>
			<div className="mt-3 space-y-1 text-xs text-muted-foreground">
				<p>
					Support tier:{" "}
					<strong className="font-medium">{selectedClient.tier}</strong>
				</p>
				<p>
					Auto-install:{" "}
					<strong className="font-medium">
						{selectedClient.autoInstall ? "yes" : "no"}
					</strong>
				</p>
				<p>
					Modes:{" "}
					<strong className="font-medium">
						{selectedClient.supportsLocal ? "local" : ""}
						{selectedClient.supportsLocal && selectedClient.supportsRemote
							? " + "
							: ""}
						{selectedClient.supportsRemote ? "remote" : ""}
					</strong>
				</p>
				<p>
					Config path:{" "}
					<strong className="font-medium">
						{selectedClient.defaultConfigPath ?? "manual / client-specific"}
					</strong>
				</p>
			</div>

			<div className="mt-4 space-y-3">
				{lastSecret ? (
					<>
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
					</>
				) : (
					<p className="text-xs text-muted-foreground">
						Create or rotate a key to generate a copy-ready snippet with that
						key.
					</p>
				)}
				{cliLoginCommand ? (
					<div className="space-y-2">
						<p className="text-xs text-muted-foreground">
							CLI login command for `bardo mcp serve` onboarding:
						</p>
						<pre className="overflow-x-auto border border-border bg-muted/20 p-3 font-mono text-xs">
							{cliLoginCommand}
						</pre>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function DashboardClient() {
	const [state, dispatch] = useReducer(
		dashboardReducer,
		undefined,
		createDashboardState,
	);
	const { billing, keyPolicy, activeCount } = getDashboardViewModel(state);

	useEffect(() => {
		void loadDashboardData({ dispatch });
		void loadKeys({ dispatch });
	}, []);

	async function refreshCurrentSnippet(secret: string) {
		await refreshSnippet({
			dispatch,
			connectionClient: state.connectionClient,
			connectionMode: state.connectionMode,
			secret,
		});
	}

	async function reloadKeys() {
		await loadKeys({ dispatch });
	}

	async function loadMoreKeys() {
		if (state.keysLoading || state.keysNextOffset === null) {
			return;
		}
		await loadKeys({
			dispatch,
			offset: state.keysNextOffset,
			append: true,
		});
	}

	async function onCreateKey() {
		await createKey({
			state,
			activeCount,
			keyPolicy,
			dispatch,
			loadKeys: reloadKeys,
			refreshSnippet: refreshCurrentSnippet,
		});
	}

	async function onRevokeKey(keyId: string, keyName: string) {
		await revokeKey({
			keyId,
			keyName,
			dispatch,
			loadKeys: reloadKeys,
		});
	}

	async function onRotateKey(
		keyId: string,
		keyName: string,
		keyWorkspacePath: string | null,
	) {
		await rotateKey({
			keyId,
			keyName,
			keyWorkspacePath,
			dispatch,
			loadKeys: reloadKeys,
			refreshSnippet: refreshCurrentSnippet,
		});
	}

	async function onCopySecret() {
		await copySecret({
			secret: state.lastSecret,
			dispatch,
		});
	}

	async function onGenerateCliLogin() {
		await generateCliLoginCommand({ dispatch });
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
				keysHasMore={state.keysHasMore}
				busyId={state.busyId}
				onRotateKey={(keyId, keyName, keyWorkspacePath) =>
					void onRotateKey(keyId, keyName, keyWorkspacePath)
				}
				onRevokeKey={(keyId, keyName) => void onRevokeKey(keyId, keyName)}
				onLoadMore={() => void loadMoreKeys()}
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
					state.lastSecret
						? void refreshCurrentSnippet(state.lastSecret)
						: undefined
				}
				onGenerateCliLoginCommand={() => void onGenerateCliLogin()}
				lastSecret={state.lastSecret}
				lastSecretLabel={state.lastSecretLabel}
				snippet={state.snippet}
				snippetLoading={state.snippetLoading}
				cliLoginCommand={state.cliLoginCommand}
				cliLoginLoading={state.cliLoginLoading}
				copied={state.copied}
				onCopy={onCopySecret}
			/>
		</div>
	);
}
