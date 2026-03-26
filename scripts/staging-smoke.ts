import {
	createVercelProtectionHeaders,
	parseJsonOrSseJson,
	WEBSITE_REACHABLE_STATUSES,
} from "./staging-smoke-lib";

type CheckResult = {
	name: string;
	ok: boolean;
	skipped?: boolean;
	details: string;
};

type JsonRpcSuccess<T> = {
	jsonrpc: "2.0";
	id: number | string | null;
	result: T;
};

type JsonRpcError = {
	jsonrpc: "2.0";
	id: number | string | null;
	error: {
		code: number;
		message: string;
	};
};

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

function readRequiredEnv(name: string): string {
	const value = Bun.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable ${name}.`);
	}
	return value;
}

function readOptionalEnv(name: string, fallback = ""): string {
	return Bun.env[name]?.trim() || fallback;
}

function buildHealthUrl(baseUrl: string): string {
	const url = new URL(baseUrl);
	url.pathname = "/health";
	url.search = "";
	return url.toString();
}

async function fetchWithTimeout(
	input: string | URL,
	init: RequestInit,
	timeoutMs = 15_000,
): Promise<Response> {
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

async function expectStatus(args: {
	name: string;
	url: string;
	init?: RequestInit;
	expectedStatuses: number[];
}): Promise<CheckResult> {
	try {
		const response = await fetchWithTimeout(args.url, args.init ?? {});
		return {
			name: args.name,
			ok: args.expectedStatuses.includes(response.status),
			details: `${response.status} ${response.statusText}`,
		};
	} catch (error) {
		return {
			name: args.name,
			ok: false,
			details: error instanceof Error ? error.message : String(error),
		};
	}
}

async function fetchJson<T>(args: {
	url: string;
	init?: RequestInit;
	timeoutMs?: number;
}): Promise<{ response: Response; json: T }> {
	const response = await fetchWithTimeout(
		args.url,
		args.init ?? {},
		args.timeoutMs,
	);
	const body = await response.text();
	return {
		response,
		json: parseJsonOrSseJson<T>(body),
	};
}

async function postJson<T>(args: {
	url: string;
	body: unknown;
	headers?: Record<string, string>;
	timeoutMs?: number;
}): Promise<{ response: Response; json: T }> {
	return fetchJson<T>({
		url: args.url,
		timeoutMs: args.timeoutMs,
		init: {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...(args.headers ?? {}),
			},
			body: JSON.stringify(args.body),
		},
	});
}

function assertJsonRpcSuccess<T>(
	payload: JsonRpcResponse<T>,
): payload is JsonRpcSuccess<T> {
	return "result" in payload;
}

function authHeaders(
	token: string,
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		...extra,
	};
}

function formatCheck(check: CheckResult): string {
	const label = check.skipped ? "SKIP" : check.ok ? "PASS" : "FAIL";
	return `${label} ${check.name}: ${check.details}`;
}

async function startAndApproveBridgeSession(args: {
	websiteUrl: string;
	protectionHeaders: Record<string, string>;
	authCookie: string;
}): Promise<{
	sessionId: string;
	pollUrl: string;
	accessToken: string;
	refreshToken: string;
	statusUrl: string;
	plan: string;
}> {
	const started = await postJson<{
		sessionId?: string;
		pollUrl?: string;
		error?: string;
	}>({
		url: new URL(
			"/api/connect/bridge-session/start",
			args.websiteUrl,
		).toString(),
		headers: args.protectionHeaders,
		body: {},
	});

	if (!started.response.ok) {
		throw new Error(started.json.error ?? "Failed to start bridge session.");
	}

	const sessionId = started.json.sessionId?.trim();
	const pollUrl = started.json.pollUrl?.trim();
	if (!sessionId || !pollUrl) {
		throw new Error("Bridge session start returned an invalid payload.");
	}

	const approved = await postJson<{ ok?: boolean; error?: string }>({
		url: new URL(
			"/api/connect/bridge-session/approve",
			args.websiteUrl,
		).toString(),
		headers: {
			...args.protectionHeaders,
			cookie: args.authCookie,
		},
		body: { sessionId },
	});
	if (!approved.response.ok || approved.json.ok !== true) {
		throw new Error(approved.json.error ?? "Failed to approve bridge session.");
	}

	for (let attempt = 0; attempt < 10; attempt += 1) {
		const polled = await fetchJson<{
			status?: string;
			accessToken?: string;
			refreshToken?: string;
			statusUrl?: string;
			plan?: string;
			error?: string;
		}>({
			url: pollUrl,
			init: {
				headers: args.protectionHeaders,
			},
		});
		if (!polled.response.ok) {
			throw new Error(polled.json.error ?? "Bridge session poll failed.");
		}
		if (polled.json.status === "pending") {
			await Bun.sleep(750);
			continue;
		}
		if (
			polled.json.status === "approved" &&
			typeof polled.json.accessToken === "string" &&
			typeof polled.json.refreshToken === "string" &&
			typeof polled.json.statusUrl === "string"
		) {
			return {
				sessionId,
				pollUrl,
				accessToken: polled.json.accessToken,
				refreshToken: polled.json.refreshToken,
				statusUrl: polled.json.statusUrl,
				plan: typeof polled.json.plan === "string" ? polled.json.plan : "free",
			};
		}
		throw new Error(
			polled.json.error ?? "Bridge session poll returned an invalid payload.",
		);
	}

	throw new Error("Bridge session poll did not reach approved state.");
}

async function expectUnpaidBridgeDenial(args: {
	websiteUrl: string;
	protectionHeaders: Record<string, string>;
	authCookie: string;
}): Promise<CheckResult> {
	const started = await postJson<{
		sessionId?: string;
		error?: string;
	}>({
		url: new URL(
			"/api/connect/bridge-session/start",
			args.websiteUrl,
		).toString(),
		headers: args.protectionHeaders,
		body: {},
	});

	if (!started.response.ok || typeof started.json.sessionId !== "string") {
		return {
			name: "bridge-session unpaid denial",
			ok: false,
			details:
				started.json.error ?? `start failed with ${started.response.status}`,
		};
	}

	const approval = await postJson<{ error?: string }>({
		url: new URL(
			"/api/connect/bridge-session/approve",
			args.websiteUrl,
		).toString(),
		headers: {
			...args.protectionHeaders,
			cookie: args.authCookie,
		},
		body: { sessionId: started.json.sessionId },
	});

	return {
		name: "bridge-session unpaid denial",
		ok:
			approval.response.status === 403 &&
			approval.json.error ===
				"An active paid plan is required before a bridge can connect to Bardo.",
		details: `${approval.response.status} ${approval.json.error ?? "missing error"}`,
	};
}

function hasReportMarkdown(value: unknown, heading: string): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as {
		rawMarkdown?: unknown;
		content?: Array<{ text?: unknown }>;
	};
	if (
		typeof candidate.rawMarkdown === "string" &&
		candidate.rawMarkdown.includes(heading)
	) {
		return true;
	}
	const contentText = candidate.content
		?.map((entry) => (typeof entry.text === "string" ? entry.text : ""))
		.join("\n");
	return typeof contentText === "string" && contentText.includes(heading);
}

async function main() {
	const websiteUrl = readRequiredEnv("STAGING_WEBSITE_URL");
	const mcpUrl = readRequiredEnv("STAGING_MCP_URL");
	const authCookie = readOptionalEnv("STAGING_AUTH_COOKIE");
	const unpaidAuthCookie = readOptionalEnv("STAGING_UNPAID_AUTH_COOKIE");
	const bridgeAccessToken =
		readOptionalEnv("STAGING_BRIDGE_ACCESS_TOKEN") ||
		readOptionalEnv("STAGING_API_KEY");
	const protectionHeaders = createVercelProtectionHeaders(
		readOptionalEnv("STAGING_VERCEL_PROTECTION_BYPASS_SECRET"),
	);

	const checks: CheckResult[] = [];

	for (const [name, pathname] of [
		["website root", "/"],
		["website pricing", "/pricing"],
		["website legal", "/legal"],
		["website docs index", "/docs"],
		["website docs install", "/docs/install"],
		["website docs connect", "/docs/connect-client"],
	] as const) {
		checks.push(
			await expectStatus({
				name,
				url: new URL(pathname, websiteUrl).toString(),
				init: { headers: protectionHeaders },
				expectedStatuses: [...WEBSITE_REACHABLE_STATUSES],
			}),
		);
	}

	checks.push(
		await expectStatus({
			name: "dashboard signed-out redirect",
			url: new URL("/dashboard", websiteUrl).toString(),
			init: {
				headers: protectionHeaders,
				redirect: "manual",
			},
			expectedStatuses: [307, 308],
		}),
	);

	checks.push(
		await expectStatus({
			name: "mcp health",
			url: buildHealthUrl(mcpUrl),
			expectedStatuses: [200],
		}),
	);

	let approvedBridge: {
		sessionId: string;
		pollUrl: string;
		accessToken: string;
		refreshToken: string;
		statusUrl: string;
		plan: string;
	} | null = null;

	if (authCookie) {
		const dashboard = await expectStatus({
			name: "dashboard signed-in render",
			url: new URL("/dashboard", websiteUrl).toString(),
			init: {
				headers: {
					...protectionHeaders,
					cookie: authCookie,
				},
			},
			expectedStatuses: [200],
		});
		checks.push(dashboard);

		const billing = await fetchJson<{
			billing?: {
				plan?: string;
				billingUnavailable?: boolean;
			};
			error?: string;
		}>({
			url: new URL("/api/billing", websiteUrl).toString(),
			init: {
				headers: {
					...protectionHeaders,
					cookie: authCookie,
				},
			},
		});
		checks.push({
			name: "website billing paid user",
			ok:
				billing.response.ok &&
				billing.json.billing?.billingUnavailable === false &&
				billing.json.billing?.plan !== "free",
			details: `${billing.response.status} plan=${billing.json.billing?.plan ?? "missing"}`,
		});

		try {
			approvedBridge = await startAndApproveBridgeSession({
				websiteUrl,
				protectionHeaders,
				authCookie,
			});
			checks.push({
				name: "bridge-session approve",
				ok: true,
				details: `plan=${approvedBridge.plan} session=${approvedBridge.sessionId}`,
			});
		} catch (error) {
			checks.push({
				name: "bridge-session approve",
				ok: false,
				details: error instanceof Error ? error.message : String(error),
			});
		}
	} else {
		checks.push({
			name: "dashboard signed-in render",
			ok: true,
			skipped: true,
			details:
				"Set STAGING_AUTH_COOKIE to validate paid user dashboard and bridge approval.",
		});
		checks.push({
			name: "website billing paid user",
			ok: true,
			skipped: true,
			details:
				"Set STAGING_AUTH_COOKIE to validate Clerk billing for a paid user.",
		});
		checks.push({
			name: "bridge-session approve",
			ok: true,
			skipped: true,
			details:
				"Set STAGING_AUTH_COOKIE to validate the browser-approved bridge flow.",
		});
	}

	if (unpaidAuthCookie) {
		checks.push(
			await expectUnpaidBridgeDenial({
				websiteUrl,
				protectionHeaders,
				authCookie: unpaidAuthCookie,
			}),
		);
	} else {
		checks.push({
			name: "bridge-session unpaid denial",
			ok: true,
			skipped: true,
			details:
				"Set STAGING_UNPAID_AUTH_COOKIE to validate the unpaid rejection path.",
		});
	}

	const activeAccessToken = approvedBridge?.accessToken || bridgeAccessToken;
	if (!activeAccessToken) {
		checks.push({
			name: "protected MCP flow",
			ok: true,
			skipped: true,
			details:
				"Set STAGING_AUTH_COOKIE or STAGING_BRIDGE_ACCESS_TOKEN to validate authenticated MCP requests.",
		});
	} else {
		const initializeWithoutAuth = await expectStatus({
			name: "mcp initialize without credential",
			url: mcpUrl,
			init: {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-06-18",
						capabilities: {},
						clientInfo: { name: "staging-smoke", version: "1.0.0" },
					},
				}),
			},
			expectedStatuses: [401],
		});
		checks.push(initializeWithoutAuth);

		const initializeInvalid = await expectStatus({
			name: "mcp initialize invalid credential",
			url: mcpUrl,
			init: {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					authorization: "Bearer invalid-staging-token",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "initialize",
					params: {
						protocolVersion: "2025-06-18",
						capabilities: {},
						clientInfo: { name: "staging-smoke", version: "1.0.0" },
					},
				}),
			},
			expectedStatuses: [401, 403],
		});
		checks.push(initializeInvalid);

		const initialize = await postJson<
			JsonRpcResponse<{
				protocolVersion: string;
			}>
		>({
			url: mcpUrl,
			headers: authHeaders(activeAccessToken),
			body: {
				jsonrpc: "2.0",
				id: 3,
				method: "initialize",
				params: {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "staging-smoke", version: "1.0.0" },
				},
			},
		});
		const mcpSessionId = initialize.response.headers.get("mcp-session-id");
		checks.push({
			name: "mcp initialize valid credential",
			ok:
				initialize.response.ok &&
				assertJsonRpcSuccess(initialize.json) &&
				initialize.json.result.protocolVersion === "2025-06-18" &&
				Boolean(mcpSessionId),
			details: `${initialize.response.status} session=${mcpSessionId ?? "missing"}`,
		});

		const sessionHeaders = authHeaders(activeAccessToken, {
			"mcp-session-id": mcpSessionId ?? "",
		});

		const toolsList = await postJson<
			JsonRpcResponse<{ tools: Array<{ name: string }> }>
		>({
			url: mcpUrl,
			headers: sessionHeaders,
			body: {
				jsonrpc: "2.0",
				id: 4,
				method: "tools/list",
				params: {},
			},
		});
		const toolNames =
			toolsList.response.ok && assertJsonRpcSuccess(toolsList.json)
				? toolsList.json.result.tools.map((tool) => tool.name).sort()
				: [];
		checks.push({
			name: "mcp tools/list",
			ok:
				toolsList.response.ok &&
				toolNames.join(",") ===
					[
						"context_query",
						"continuity_audit",
						"player_knowledge_view",
						"scene_turn",
						"timeline_diff",
						"world_state_overview",
					]
						.sort()
						.join(","),
			details: toolNames.join(", "),
		});

		const runtimeStatus = await fetchJson<{
			valid?: boolean;
			plan?: string;
			error?: string;
		}>({
			url:
				approvedBridge?.statusUrl ??
				new URL("/api/connect/runtime-status", websiteUrl).toString(),
			init: {
				headers: authHeaders(activeAccessToken, protectionHeaders),
			},
		});
		checks.push({
			name: "website runtime-status",
			ok: runtimeStatus.response.ok && runtimeStatus.json.valid === true,
			details: `${runtimeStatus.response.status} plan=${runtimeStatus.json.plan ?? "missing"}`,
		});

		const reportTool = await postJson<
			JsonRpcResponse<{
				structuredContent?: {
					success?: boolean;
					rawMarkdown?: string;
				};
			}>
		>({
			url: mcpUrl,
			headers: sessionHeaders,
			body: {
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: {
					name: "world_state_overview",
					arguments: {},
				},
			},
		});
		const reportContent =
			reportTool.response.ok && assertJsonRpcSuccess(reportTool.json)
				? reportTool.json.result.structuredContent
				: undefined;
		checks.push({
			name: "world_state_overview tool",
			ok:
				reportTool.response.ok &&
				reportContent?.success === true &&
				hasReportMarkdown(reportContent, "# World State Overview"),
			details: JSON.stringify(
				reportContent ?? "missing structured content",
			).slice(0, 160),
		});

		const sceneTurn = await postJson<
			JsonRpcResponse<{
				structuredContent?: {
					success?: boolean;
					message?: string;
					gmPacket?: {
						narrativeBeats?: string[];
					};
				};
			}>
		>({
			url: mcpUrl,
			headers: sessionHeaders,
			body: {
				jsonrpc: "2.0",
				id: 6,
				method: "tools/call",
				params: {
					name: "scene_turn",
					arguments: {
						action:
							"I gather the most important recent facts before framing the next scene.",
						idempotencyKey: `staging-smoke-scene-turn-${Date.now()}`,
					},
				},
			},
		});
		const sceneTurnContent =
			sceneTurn.response.ok && assertJsonRpcSuccess(sceneTurn.json)
				? sceneTurn.json.result.structuredContent
				: undefined;
		checks.push({
			name: "scene_turn tool",
			ok:
				sceneTurn.response.ok &&
				sceneTurnContent?.success === true &&
				(sceneTurnContent.gmPacket?.narrativeBeats?.length ?? 0) > 0,
			details:
				sceneTurnContent?.message ??
				(sceneTurn.response.ok
					? "missing structured content"
					: "request failed"),
		});
	}

	for (const check of checks) {
		console.log(formatCheck(check));
	}

	const failed = checks.filter((check) => !check.ok && !check.skipped);
	if (failed.length > 0) {
		console.error(`\n${failed.length} staging smoke check(s) failed.`);
		process.exit(1);
	}

	console.log(`\nAll ${checks.length} staging smoke checks passed.`);
}

await main();
