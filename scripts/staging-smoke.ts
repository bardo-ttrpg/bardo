import {
	createVercelProtectionHeaders,
	parseJsonOrSseJson,
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
	const json = parseJsonOrSseJson<T>(await response.text());
	return { response, json };
}

function assertJsonRpcSuccess<T>(
	payload: JsonRpcResponse<T>,
): payload is JsonRpcSuccess<T> {
	return "result" in payload;
}

function hasStructuredReportMarkdown(value: unknown, heading: string): boolean {
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
	const apiKey = readRequiredEnv("STAGING_API_KEY");
	const introspectionToken = readRequiredEnv("STAGING_INTROSPECTION_TOKEN");
	const authCookie = Bun.env.STAGING_AUTH_COOKIE?.trim() || "";
	const connectClient = readOptionalEnv("STAGING_CONNECT_CLIENT", "codex");
	const connectMode = readOptionalEnv("STAGING_CONNECT_MODE", "remote");
	const mcpServerName = readOptionalEnv("STAGING_MCP_SERVER_NAME", "bardo");
	const websiteProtectionBypassSecret = readOptionalEnv(
		"STAGING_VERCEL_PROTECTION_BYPASS_SECRET",
		"",
	);
	const websiteProtectionHeaders = createVercelProtectionHeaders(
		websiteProtectionBypassSecret,
	);

	const checks: CheckResult[] = [];

	checks.push(
		await expectStatus({
			name: "website root",
			url: websiteUrl,
			init: {
				headers: websiteProtectionHeaders,
			},
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
			...websiteProtectionHeaders,
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
			toolNames.includes("init") &&
			toolNames.includes("context_query") &&
			toolNames.includes("scene_turn") &&
			toolNames.includes("player_action") &&
			!toolNames.includes("campaign_turn") &&
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

	const reportResource = await postJson<
		JsonRpcResponse<{ contents?: Array<{ text?: string }> }>
	>({
		url: mcpUrl,
		headers: sessionHeaders,
		body: {
			jsonrpc: "2.0",
			id: 51,
			method: "resources/read",
			params: {
				uri: "resource://reports/world-state-overview",
			},
		},
	});
	const reportResourceMarkdown =
		reportResource.response.ok && assertJsonRpcSuccess(reportResource.json)
			? (reportResource.json.result.contents?.[0]?.text ?? "")
			: "";
	checks.push({
		name: "mcp report resource",
		ok:
			reportResource.response.ok &&
			reportResourceMarkdown.includes("# World State Overview") &&
			reportResourceMarkdown.includes("events/canonical.ndjson"),
		details: reportResourceMarkdown.slice(0, 120),
	});

	const lastSessionResource = await postJson<
		JsonRpcResponse<{ contents?: Array<{ text?: string }> }>
	>({
		url: mcpUrl,
		headers: sessionHeaders,
		body: {
			jsonrpc: "2.0",
			id: 52,
			method: "resources/read",
			params: {
				uri: "resource://reports/last-session-diff",
			},
		},
	});
	const lastSessionResourceMarkdown =
		lastSessionResource.response.ok &&
		assertJsonRpcSuccess(lastSessionResource.json)
			? (lastSessionResource.json.result.contents?.[0]?.text ?? "")
			: "";
	checks.push({
		name: "mcp last-session resource",
		ok:
			lastSessionResource.response.ok &&
			lastSessionResourceMarkdown.includes("# Timeline Diff") &&
			lastSessionResourceMarkdown.includes("Evidence references:"),
		details: lastSessionResourceMarkdown.slice(0, 120),
	});

	const reportTool = await postJson<
		JsonRpcResponse<{
			structuredContent?: { success?: boolean; rawMarkdown?: string };
		}>
	>({
		url: mcpUrl,
		headers: sessionHeaders,
		body: {
			jsonrpc: "2.0",
			id: 53,
			method: "tools/call",
			params: {
				name: "world_state_overview",
				arguments: {},
			},
		},
	});
	const reportToolContent =
		reportTool.response.ok && assertJsonRpcSuccess(reportTool.json)
			? reportTool.json.result.structuredContent
			: undefined;
	checks.push({
		name: "mcp report tool",
		ok:
			reportTool.response.ok &&
			reportToolContent?.success === true &&
			hasStructuredReportMarkdown(reportToolContent, "# World State Overview"),
		details: JSON.stringify(
			reportToolContent ?? "missing structured content",
		).slice(0, 120),
	});

	const lastSessionTool = await postJson<
		JsonRpcResponse<{
			structuredContent?: { success?: boolean; rawMarkdown?: string };
		}>
	>({
		url: mcpUrl,
		headers: sessionHeaders,
		body: {
			jsonrpc: "2.0",
			id: 54,
			method: "tools/call",
			params: {
				name: "last_session_diff",
				arguments: {},
			},
		},
	});
	const lastSessionToolContent =
		lastSessionTool.response.ok && assertJsonRpcSuccess(lastSessionTool.json)
			? lastSessionTool.json.result.structuredContent
			: undefined;
	checks.push({
		name: "mcp last-session tool",
		ok:
			lastSessionTool.response.ok &&
			lastSessionToolContent?.success === true &&
			hasStructuredReportMarkdown(lastSessionToolContent, "# Timeline Diff"),
		details: JSON.stringify(
			lastSessionToolContent ?? "missing structured content",
		).slice(0, 120),
	});

	const sceneTurn = await postJson<
		JsonRpcResponse<{
			structuredContent?: {
				success?: boolean;
				message?: string;
				gmPacket?: {
					narrativeBeats?: string[];
					discoveries?: Array<{ persisted?: boolean }>;
				};
				consistency?: {
					success?: boolean;
					errorCount?: number;
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
					action: "I listen to the tavern for gossip.",
					idempotencyKey: "staging-smoke-scene-turn",
				},
			},
		},
	});
	const sceneTurnContent =
		sceneTurn.response.ok && assertJsonRpcSuccess(sceneTurn.json)
			? sceneTurn.json.result.structuredContent
			: undefined;
	checks.push({
		name: "scene_turn gameplay",
		ok:
			sceneTurn.response.ok &&
			sceneTurnContent?.success === true &&
			(sceneTurnContent.gmPacket?.narrativeBeats?.length ?? 0) > 0 &&
			sceneTurnContent.consistency?.success === true &&
			(sceneTurnContent.consistency?.errorCount ?? 1) === 0,
		details:
			sceneTurnContent?.message ??
			(sceneTurn.response.ok ? "missing structured content" : "request failed"),
	});

	const runtimeStatus = await fetchWithTimeout(
		new URL("/api/connect/runtime-status", websiteUrl).toString(),
		{
			headers: {
				...websiteProtectionHeaders,
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
		headers: websiteProtectionHeaders,
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
		headers: websiteProtectionHeaders,
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
		const pendingPoll = await fetchWithTimeout(pollUrl, {
			headers: websiteProtectionHeaders,
		});
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
			...websiteProtectionHeaders,
			cookie: authCookie,
		};

		const authKeys = await fetchWithTimeout(
			new URL("/api/keys?limit=20&offset=0", websiteUrl).toString(),
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

		const existingKeyId = authKeysJson.keys?.[0]?.id?.trim() || "";
		if (existingKeyId) {
			const keySlotRecovery = await fetchWithTimeout(
				new URL(`/api/keys/${existingKeyId}`, websiteUrl).toString(),
				{
					method: "DELETE",
					headers: authHeaders,
				},
			);
			const keySlotRecoveryJson = (await keySlotRecovery.json()) as {
				revoked?: boolean;
				error?: string;
			};
			checks.push({
				name: "website authenticated key-slot recovery",
				ok: keySlotRecovery.ok && keySlotRecoveryJson.revoked === true,
				details: `${keySlotRecovery.status} revoked=${String(keySlotRecoveryJson.revoked)}`,
			});
		}

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
				new URL(`/api/keys/${createdKeyId}`, websiteUrl).toString(),
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
				const approvedPoll = await fetchWithTimeout(pollUrl, {
					headers: websiteProtectionHeaders,
				});
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
								...websiteProtectionHeaders,
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

					const approvedKeyList = await fetchWithTimeout(
						new URL("/api/keys?limit=20&offset=0", websiteUrl).toString(),
						{
							headers: authHeaders,
						},
					);
					const approvedKeyListJson = (await approvedKeyList.json()) as {
						keys?: Array<{ id?: string }>;
					};
					const approvedKeyId = approvedKeyListJson.keys?.[0]?.id?.trim() || "";
					if (approvedKeyId) {
						const releaseApprovedKey = await fetchWithTimeout(
							new URL(`/api/keys/${approvedKeyId}`, websiteUrl).toString(),
							{
								method: "DELETE",
								headers: authHeaders,
							},
						);
						const releaseApprovedKeyJson =
							(await releaseApprovedKey.json()) as {
								revoked?: boolean;
								error?: string;
							};
						checks.push({
							name: "website cli-session key cleanup",
							ok:
								releaseApprovedKey.ok &&
								releaseApprovedKeyJson.revoked === true,
							details: `${releaseApprovedKey.status} revoked=${String(releaseApprovedKeyJson.revoked)}`,
						});
					}
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
				headers: websiteProtectionHeaders,
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
							...websiteProtectionHeaders,
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
