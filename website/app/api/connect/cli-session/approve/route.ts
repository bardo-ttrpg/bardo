import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveRouteUserId } from "../../../../../lib/clerk-route-auth";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";

export const runtime = "nodejs";

type CreateApiKeyResult = {
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

const defaultDeps: CliSessionApproveDeps = {
	resolveUserId: async () =>
		resolveRouteUserId("/api/connect/cli-session/approve"),
	createApiKey: async ({ userId, name, scopes }) => {
		const clerk = await clerkClient();
		const apiKey = await clerk.apiKeys.create({
			name,
			subject: userId,
			scopes,
			claims: { workspacePath: `./customers/${userId}` },
		});
		if (
			typeof apiKey.secret !== "string" ||
			apiKey.secret.trim().length === 0
		) {
			throw new Error("Clerk did not return an API key secret.");
		}
		return {
			secret: apiKey.secret,
			name: apiKey.name,
		};
	},
	approveSession: async (args) =>
		getDefaultCliDeviceSessionService().approve(args),
	resolveMcpUrl,
	resolveStatusUrl,
	now: () => new Date(),
	telemetry: getDefaultConnectTelemetry(),
};

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

		try {
			const now = deps.now();
			const key = await deps.createApiKey({
				userId: authState.userId,
				name: `CLI Login ${now.toISOString()}`,
				scopes: ["mcp"],
			});
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
			deps.telemetry.increment("cli_session_approve_failed");
			return NextResponse.json(
				{
					error: error instanceof Error ? error.message : String(error),
				},
				{ status: 500 },
			);
		}
	};
}

export const POST = createCliSessionApprovePostHandler();
