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

function readOptionalEnv(name: string, fallback: string): string {
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
		const ok = args.expectedStatuses.includes(response.status);
		return {
			name: args.name,
			ok,
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

async function postJson<T>(args: {
	url: string;
	body: unknown;
	headers?: Record<string, string>;
	timeoutMs?: number;
}): Promise<{ response: Response; json: T }> {
	const response = await fetchWithTimeout(
		args.url,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...(args.headers ?? {}),
			},
			body: JSON.stringify(args.body),
		},
		args.timeoutMs,
	);
	const json = (await response.json()) as T;
	return { response, json };
}

function assertJsonRpcSuccess<T>(
	payload: JsonRpcResponse<T>,
): payload is JsonRpcSuccess<T> {
	return "result" in payload;
}

async function main() {
	const websiteUrl = readRequiredEnv("STAGING_WEBSITE_URL");
	const mcpUrl = readRequiredEnv("STAGING_MCP_URL");
	const apiKey = readRequiredEnv("STAGING_API_KEY");
	const introspectionToken = readRequiredEnv("STAGING_INTROSPECTION_TOKEN");
	const authCookie = Bun.env.STAGING_AUTH_COOKIE?.trim() || "";
	const connectClient = readOptionalEnv("STAGING_CONNECT_CLIENT", "codex");
	const connectMode = readOptionalEnv("STAGING_CONNECT_MODE", "remote");
	const mcpServerName = readOptionalEnv("STAGING_MCP_SERVER_NAME", "bardo");

	const checks: CheckResult[] = [];

	checks.push(
		await expectStatus({
			name: "website root",
			url: websiteUrl,
			expectedStatuses: [200, 301, 302, 307, 308],
		}),
	);

	const healthResult = await expectStatus({
		name: "mcp health",
		url: buildHealthUrl(mcpUrl),
		expectedStatuses: [200],
	});
	checks.push(healthResult);

	const introspection = await postJson<{ valid?: boolean }>({
		url: new URL("/api/auth/introspect-key", websiteUrl).toString(),
		headers: {
			"x-bardo-introspection-token": introspectionToken,
		},
		body: {
			apiKey,
			requiredScope: "mcp",
		},
	});
	checks.push({
		name: "website introspection",
		ok: introspection.response.ok && introspection.json.valid === true,
		details: `${introspection.response.status} valid=${String(introspection.json.valid)}`,
	});

	checks.push(
		await expectStatus({
			name: "mcp initialize without key",
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
		}),
	);

	checks.push(
		await expectStatus({
			name: "mcp initialize invalid key",
			url: mcpUrl,
			init: {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					"x-api-key": "invalid-staging-key",
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
			expectedStatuses: [403],
		}),
	);

	const initialize = await postJson<
		JsonRpcResponse<{
			protocolVersion: string;
		}>
	>({
		url: mcpUrl,
		headers: {
			"x-api-key": apiKey,
		},
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
		name: "mcp initialize valid key",
		ok:
			initialize.response.ok &&
			assertJsonRpcSuccess(initialize.json) &&
			initialize.json.result.protocolVersion === "2025-06-18" &&
			Boolean(mcpSessionId),
		details: `${initialize.response.status} session=${mcpSessionId ?? "missing"}`,
	});

	const sessionHeaders = {
		"x-api-key": apiKey,
		"mcp-session-id": mcpSessionId ?? "",
	};

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
			? toolsList.json.result.tools.map((tool) => tool.name)
			: [];
	checks.push({
		name: "mcp tools/list",
		ok:
			toolsList.response.ok &&
			toolNames.includes("campaign_turn") &&
			toolNames.includes("context_query") &&
			toolNames.includes("generate_session_recap") &&
			!toolNames.includes("scene_turn") &&
			!toolNames.includes("player_action") &&
			!toolNames.includes("verify_narration"),
		details: toolNames.join(", "),
	});

	const promptsList = await postJson<
		JsonRpcResponse<{ prompts: Array<{ name: string }> }>
	>({
		url: mcpUrl,
		headers: sessionHeaders,
		body: {
			jsonrpc: "2.0",
			id: 5,
			method: "prompts/list",
			params: {},
		},
	});
	const promptNames =
		promptsList.response.ok && assertJsonRpcSuccess(promptsList.json)
			? promptsList.json.result.prompts.map((prompt) => prompt.name)
			: [];
	checks.push({
		name: "mcp prompts/list",
		ok:
			promptsList.response.ok &&
			promptNames.includes("run_scene_turn") &&
			promptNames.includes("generate_session_recap"),
		details: promptNames.join(", "),
	});

	const turnMessages = [
		{
			name: "campaign_turn query",
			id: 6,
			message: "What do we know about the current location?",
			workflow: "context_query",
		},
		{
			name: "campaign_turn recap",
			id: 7,
			message: "Give me a recap of what happened so far.",
			workflow: "generate_session_recap",
		},
		{
			name: "campaign_turn gameplay",
			id: 8,
			message: "I listen to the tavern for gossip.",
			workflow: "scene_turn",
		},
	] as const;

	for (const turn of turnMessages) {
		const response = await postJson<
			JsonRpcResponse<{
				structuredContent?: {
					success?: boolean;
					status?: string;
					workflow?: string;
					verification?: { safeToPresent?: boolean };
				};
			}>
		>({
			url: mcpUrl,
			headers: sessionHeaders,
			body: {
				jsonrpc: "2.0",
				id: turn.id,
				method: "tools/call",
				params: {
					name: "campaign_turn",
					arguments: {
						message: turn.message,
						includeState: true,
					},
				},
			},
		});
		const content =
			response.response.ok && assertJsonRpcSuccess(response.json)
				? response.json.result.structuredContent
				: undefined;
		checks.push({
			name: turn.name,
			ok:
				response.response.ok &&
				content?.success === true &&
				content.status === "complete" &&
				content.workflow === turn.workflow &&
				content.verification?.safeToPresent === true,
			details: `status=${content?.status ?? "unknown"} workflow=${content?.workflow ?? "unknown"}`,
		});
	}

	const runtimeStatus = await fetchWithTimeout(
		new URL("/api/connect/runtime-status", websiteUrl),
		{
			headers: {
				BARDO_API_KEY: apiKey,
			},
		},
	);
	const runtimeStatusJson = (await runtimeStatus.json()) as { valid?: boolean };
	checks.push({
		name: "website runtime-status",
		ok: runtimeStatus.ok && runtimeStatusJson.valid === true,
		details: `${runtimeStatus.status} valid=${String(runtimeStatusJson.valid)}`,
	});

	const snippets = await postJson<{ baseUrl?: string; snippet?: string }>({
		url: new URL("/api/connect/snippets", websiteUrl).toString(),
		body: {
			client: connectClient,
			mode: connectMode,
			apiKey,
			serverName: mcpServerName,
		},
	});
	const expectedSnippetBaseUrl = new URL("/mcp", mcpUrl).toString();
	checks.push({
		name: "website connect snippets",
		ok:
			snippets.response.ok &&
			snippets.json.baseUrl === expectedSnippetBaseUrl &&
			typeof snippets.json.snippet === "string" &&
			snippets.json.snippet.length > 0,
		details: `${snippets.response.status} baseUrl=${snippets.json.baseUrl ?? "missing"}`,
	});

	const cliSessionStart = await postJson<
		| {
				sessionId?: string;
				pollUrl?: string;
				verificationUrl?: string;
				intervalMs?: number;
		  }
		| { error?: string }
	>({
		url: new URL("/api/connect/cli-session/start", websiteUrl).toString(),
		body: {},
	});
	const pollUrl =
		typeof cliSessionStart.json.pollUrl === "string"
			? cliSessionStart.json.pollUrl
			: "";
	const cliSessionId =
		typeof cliSessionStart.json.sessionId === "string"
			? cliSessionStart.json.sessionId
			: "";
	checks.push({
		name: "website cli-session start",
		ok:
			cliSessionStart.response.ok &&
			pollUrl.length > 0 &&
			cliSessionId.length > 0 &&
			typeof cliSessionStart.json.verificationUrl === "string" &&
			typeof cliSessionStart.json.intervalMs === "number",
		details: `${cliSessionStart.response.status} session=${cliSessionId || "missing"}`,
	});

	if (pollUrl) {
		const pendingPoll = await fetchWithTimeout(pollUrl, {});
		const pendingPollJson = (await pendingPoll.json()) as {
			status?: string;
			intervalMs?: number;
		};
		checks.push({
			name: "website cli-session poll pending",
			ok:
				pendingPoll.ok &&
				pendingPollJson.status === "pending" &&
				typeof pendingPollJson.intervalMs === "number",
			details: `${pendingPoll.status} status=${pendingPollJson.status ?? "missing"}`,
		});
	}

	if (!authCookie) {
		checks.push({
			name: "website authenticated smoke flows",
			ok: true,
			skipped: true,
			details:
				"set STAGING_AUTH_COOKIE to enable dashboard key lifecycle and protected CLI smoke checks",
		});
	} else {
		const authHeaders = {
			cookie: authCookie,
		};

		const authKeys = await fetchWithTimeout(
			new URL("/api/keys?limit=20&offset=0", websiteUrl),
			{
				headers: authHeaders,
			},
		);
		const authKeysJson = (await authKeys.json()) as {
			keys?: Array<{ id?: string }>;
			page?: { hasMore?: boolean; nextOffset?: number | null };
		};
		checks.push({
			name: "website authenticated keys list",
			ok:
				authKeys.ok &&
				Array.isArray(authKeysJson.keys) &&
				typeof authKeysJson.page?.hasMore === "boolean" &&
				"nextOffset" in (authKeysJson.page ?? {}),
			details: `${authKeys.status} keys=${String(authKeysJson.keys?.length ?? 0)}`,
		});

		const keyName = `staging-smoke-${Date.now()}`;
		const createdKey = await postJson<{
			key?: { id?: string; name?: string };
			secret?: string;
			error?: string;
		}>({
			url: new URL("/api/keys", websiteUrl).toString(),
			headers: authHeaders,
			body: {
				name: keyName,
				scopes: ["mcp"],
			},
		});
		const createdKeyId = createdKey.json.key?.id?.trim() || "";
		const createdKeySecret = createdKey.json.secret?.trim() || "";
		checks.push({
			name: "website authenticated key create",
			ok:
				createdKey.response.ok &&
				createdKeyId.length > 0 &&
				createdKeySecret.length > 0 &&
				createdKey.json.key?.name === keyName,
			details: `${createdKey.response.status} key=${createdKeyId || "missing"}`,
		});

		if (createdKeyId) {
			const deleteResponse = await fetchWithTimeout(
				new URL(`/api/keys/${createdKeyId}`, websiteUrl),
				{
					method: "DELETE",
					headers: authHeaders,
				},
			);
			const deleteJson = (await deleteResponse.json()) as {
				revoked?: boolean;
				error?: string;
			};
			checks.push({
				name: "website authenticated key delete",
				ok: deleteResponse.ok && deleteJson.revoked === true,
				details: `${deleteResponse.status} revoked=${String(deleteJson.revoked)}`,
			});
		}

		if (cliSessionId) {
			const approval = await postJson<{ ok?: boolean; error?: string }>({
				url: new URL("/api/connect/cli-session/approve", websiteUrl).toString(),
				headers: authHeaders,
				body: {
					sessionId: cliSessionId,
				},
			});
			checks.push({
				name: "website cli-session approve",
				ok: approval.response.ok && approval.json.ok === true,
				details: `${approval.response.status} ok=${String(approval.json.ok)}`,
			});

			if (pollUrl) {
				const approvedPoll = await fetchWithTimeout(pollUrl, {});
				const approvedPollJson = (await approvedPoll.json()) as {
					status?: string;
					apiKey?: string;
					statusUrl?: string;
				};
				checks.push({
					name: "website cli-session poll approved",
					ok:
						approvedPoll.ok &&
						approvedPollJson.status === "approved" &&
						typeof approvedPollJson.apiKey === "string" &&
						typeof approvedPollJson.statusUrl === "string",
					details: `${approvedPoll.status} status=${approvedPollJson.status ?? "missing"}`,
				});

				if (approvedPollJson.apiKey && approvedPollJson.statusUrl) {
					const approvedRuntimeStatus = await fetchWithTimeout(
						approvedPollJson.statusUrl,
						{
							headers: {
								BARDO_API_KEY: approvedPollJson.apiKey,
							},
						},
					);
					const approvedRuntimeStatusJson =
						(await approvedRuntimeStatus.json()) as {
							valid?: boolean;
						};
					checks.push({
						name: "website runtime-status via approved device-session key",
						ok:
							approvedRuntimeStatus.ok &&
							approvedRuntimeStatusJson.valid === true,
						details: `${approvedRuntimeStatus.status} valid=${String(approvedRuntimeStatusJson.valid)}`,
					});
				}
			}
		}

		const cliToken = await postJson<{
			loginToken?: string;
			exchangeUrl?: string;
			error?: string;
		}>({
			url: new URL("/api/connect/cli-token", websiteUrl).toString(),
			headers: authHeaders,
			body: {},
		});
		checks.push({
			name: "website cli-token issue",
			ok:
				cliToken.response.ok &&
				typeof cliToken.json.loginToken === "string" &&
				typeof cliToken.json.exchangeUrl === "string",
			details: `${cliToken.response.status} exchange=${cliToken.json.exchangeUrl ?? "missing"}`,
		});

		if (cliToken.json.loginToken && cliToken.json.exchangeUrl) {
			const cliExchange = await postJson<{
				apiKey?: string;
				statusUrl?: string;
				error?: string;
			}>({
				url: cliToken.json.exchangeUrl,
				body: {
					token: cliToken.json.loginToken,
				},
			});
			checks.push({
				name: "website cli-exchange",
				ok:
					cliExchange.response.ok &&
					typeof cliExchange.json.apiKey === "string" &&
					typeof cliExchange.json.statusUrl === "string",
				details: `${cliExchange.response.status} statusUrl=${cliExchange.json.statusUrl ?? "missing"}`,
			});

			if (cliExchange.json.apiKey && cliExchange.json.statusUrl) {
				const exchangedRuntimeStatus = await fetchWithTimeout(
					cliExchange.json.statusUrl,
					{
						headers: {
							BARDO_API_KEY: cliExchange.json.apiKey,
						},
					},
				);
				const exchangedRuntimeStatusJson =
					(await exchangedRuntimeStatus.json()) as {
						valid?: boolean;
					};
				checks.push({
					name: "website runtime-status via exchanged cli-token key",
					ok:
						exchangedRuntimeStatus.ok &&
						exchangedRuntimeStatusJson.valid === true,
					details: `${exchangedRuntimeStatus.status} valid=${String(exchangedRuntimeStatusJson.valid)}`,
				});
			}
		}
	}

	for (const check of checks) {
		const statusLabel = check.skipped ? "SKIP" : check.ok ? "PASS" : "FAIL";
		console.log(`${statusLabel} ${check.name}: ${check.details}`);
	}

	const failed = checks.filter((check) => !check.ok && !check.skipped);
	if (failed.length > 0) {
		console.error(`\n${failed.length} staging smoke check(s) failed.`);
		process.exit(1);
	}

	console.log(`\nAll ${checks.length} staging smoke checks passed.`);
}

await main();
