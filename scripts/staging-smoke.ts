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
				"An active Pro subscription is required before a bridge can connect to Bardo.",
		details: `${approval.response.status} ${approval.json.error ?? "missing error"}`,
	};
}

async function expectUnauthenticatedApproveRequiresBrowserSession(args: {
	websiteUrl: string;
	protectionHeaders: Record<string, string>;
}): Promise<CheckResult> {
	const approval = await postJson<{ error?: string }>({
		url: new URL(
			"/api/connect/bridge-session/approve",
			args.websiteUrl,
		).toString(),
		headers: args.protectionHeaders,
		body: { sessionId: "unauthenticated-smoke-check" },
	});

	return {
		name: "bridge-session unauthenticated approve",
		ok:
			approval.response.status === 401 &&
			approval.json.error === "Unauthorized",
		details: `${approval.response.status} ${approval.json.error ?? "missing error"}`,
	};
}

async function main() {
	const websiteUrl = readRequiredEnv("STAGING_WEBSITE_URL");
	const authCookie = readOptionalEnv("STAGING_AUTH_COOKIE");
	const unpaidAuthCookie = readOptionalEnv("STAGING_UNPAID_AUTH_COOKIE");
	const runtimeAccessToken =
		readOptionalEnv("STAGING_BRIDGE_ACCESS_TOKEN") ||
		readOptionalEnv("STAGING_API_KEY");
	const protectionHeaders = createVercelProtectionHeaders(
		readOptionalEnv("STAGING_VERCEL_PROTECTION_BYPASS_SECRET"),
	);

	const checks: CheckResult[] = [];

	for (const [name, pathname] of [
		["website root", "/"],
		["website docs", "/docs"],
		["website blog", "/blog"],
		["website legal", "/legal"],
		["website pricing", "/pricing"],
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
			name: "removed contact route renders custom 404",
			url: new URL("/contact", websiteUrl).toString(),
			init: { headers: protectionHeaders },
			expectedStatuses: [404],
		}),
	);

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
		await expectUnauthenticatedApproveRequiresBrowserSession({
			websiteUrl,
			protectionHeaders,
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

	const activeAccessToken = approvedBridge?.accessToken || runtimeAccessToken;
	if (!activeAccessToken) {
		checks.push({
			name: "bridge-authenticated runtime status",
			ok: true,
			skipped: true,
			details:
				"Set STAGING_AUTH_COOKIE or STAGING_BRIDGE_ACCESS_TOKEN to validate an authenticated runtime-status request.",
		});
	} else {
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
			name: "bridge-authenticated runtime status",
			ok: runtimeStatus.response.ok && runtimeStatus.json.valid === true,
			details: `${runtimeStatus.response.status} plan=${runtimeStatus.json.plan ?? "missing"}`,
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
