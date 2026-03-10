import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { assertApiKeyCreationAllowed } from "../../../../../lib/api-key-creation-policy";
import {
	CLI_LOGIN_KEY_SLOT_REQUIRED_MESSAGE,
	isApiKeyLimitReachedMessage,
} from "../../../../../lib/api-key-limit-messages";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../../lib/backend-availability";
import { resolveRouteUserId } from "../../../../../lib/clerk-route-auth";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";

export const runtime = "nodejs";

type CreateApiKeyResult = {
	id: string;
	secret: string;
	name: string;
};

type CliSessionApproveDeps = {
	resolveUserId: (
		request: Request,
	) => Promise<{ userId: string | null; response?: Response }>;
	createApiKey: (args: {
		userId: string;
		name: string;
		scopes: string[];
	}) => Promise<CreateApiKeyResult>;
	revokeApiKey: (args: { keyId: string }) => Promise<void>;
	approveSession: (args: {
		sessionId: string;
		payload: {
			apiKey: string;
			mcpUrl: string;
			statusUrl: string;
			serverName: string;
			issuedAtISO: string;
			expiresAtISO: string;
		};
	}) => Promise<{ ok: boolean; reason?: "missing" | "expired" | "consumed" }>;
	resolveMcpUrl: (request: Request) => string;
	resolveStatusUrl: (request: Request) => string;
	now: () => Date;
	telemetry: ConnectTelemetry;
};

function resolveMcpUrl(request: Request): string {
	const envBase =
		process.env.BARDO_MCP_BASE_URL?.trim() ||
		process.env.NEXT_PUBLIC_MCP_BASE_URL?.trim();
	if (envBase) {
		return new URL("/mcp", envBase).toString();
	}
	return new URL("/mcp", request.url).toString();
}

function resolveStatusUrl(request: Request): string {
	const envValue = process.env.BARDO_RUNTIME_STATUS_URL?.trim();
	if (envValue) {
		return envValue;
	}
	return new URL("/api/connect/runtime-status", request.url).toString();
}

function statusFromError(error: unknown): number {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number"
	) {
		const status = (error as { status: number }).status;
		if (status >= 400 && status < 600) {
			return status;
		}
	}
	return 500;
}

const defaultDeps: CliSessionApproveDeps = {
	resolveUserId: async () =>
		resolveRouteUserId("/api/connect/cli-session/approve"),
	createApiKey: async ({ userId, name, scopes }) => {
		const clerk = await clerkClient();
		await assertApiKeyCreationAllowed({ clerk, userId });
		const apiKey = await clerk.apiKeys.create({
			name,
			subject: userId,
			scopes,
			claims: { workspacePath: `./customers/${userId}` },
		});
		if (
			typeof apiKey.id !== "string" ||
			apiKey.id.trim().length === 0 ||
			typeof apiKey.secret !== "string" ||
			apiKey.secret.trim().length === 0
		) {
			throw new Error("Clerk did not return a complete API key payload.");
		}
		return {
			id: apiKey.id,
			secret: apiKey.secret,
			name: apiKey.name,
		};
	},
	revokeApiKey: async ({ keyId }) => {
		const clerk = await clerkClient();
		await clerk.apiKeys.delete(keyId);
	},
	approveSession: async (args) =>
		getDefaultCliDeviceSessionService().approve(args),
	resolveMcpUrl,
	resolveStatusUrl,
	now: () => new Date(),
	telemetry: getDefaultConnectTelemetry(),
};

async function attemptApiKeyRollback(
	deps: Pick<CliSessionApproveDeps, "revokeApiKey">,
	keyId: string | null,
) {
	if (!keyId) {
		return;
	}
	try {
		await deps.revokeApiKey({ keyId });
	} catch (rollbackError) {
		Sentry.captureException(rollbackError);
	}
}

export function createCliSessionApprovePostHandler(
	overrides: Partial<CliSessionApproveDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		const authState = await deps.resolveUserId(request);
		if (authState.response) {
			return authState.response;
		}
		if (!authState.userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = (await request.json().catch(() => ({}))) as Partial<{
			sessionId: string;
		}>;
		const sessionId = body.sessionId?.trim();
		if (!sessionId) {
			return NextResponse.json(
				{ error: "Missing sessionId." },
				{ status: 400 },
			);
		}

		let createdKeyId: string | null = null;
		try {
			const now = deps.now();
			const key = await deps.createApiKey({
				userId: authState.userId,
				name: `CLI Login ${now.toISOString()}`,
				scopes: ["mcp"],
			});
			createdKeyId = key.id;
			const approved = await deps.approveSession({
				sessionId,
				payload: {
					apiKey: key.secret,
					mcpUrl: deps.resolveMcpUrl(request),
					statusUrl: deps.resolveStatusUrl(request),
					serverName: "bardo",
					issuedAtISO: now.toISOString(),
					expiresAtISO: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
				},
			});
			if (!approved.ok) {
				await attemptApiKeyRollback(deps, createdKeyId);
				deps.telemetry.increment("cli_session_approve_rejected");
				const status =
					approved.reason === "consumed"
						? 409
						: approved.reason === "expired"
							? 410
							: 404;
				return NextResponse.json(
					{ error: `CLI session ${approved.reason ?? "failed"}.` },
					{ status },
				);
			}

			deps.telemetry.increment("cli_session_approved");
			return NextResponse.json({ ok: true });
		} catch (error) {
			await attemptApiKeyRollback(deps, createdKeyId);
			deps.telemetry.increment("cli_session_approve_failed");
			if (isBackendAvailabilityError(error)) {
				return NextResponse.json(backendAvailabilityPayload(error), {
					status: 503,
				});
			}
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return NextResponse.json(
				{
					error: isApiKeyLimitReachedMessage(errorMessage)
						? CLI_LOGIN_KEY_SLOT_REQUIRED_MESSAGE
						: errorMessage,
				},
				{ status: statusFromError(error) },
			);
		}
	};
}

export const POST = createCliSessionApprovePostHandler();
