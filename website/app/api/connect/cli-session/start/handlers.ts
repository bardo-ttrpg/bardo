import { NextResponse } from "next/server";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../../lib/backend-availability";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import { getDefaultCliSessionStartRateLimiter } from "../../../../../lib/cli-session-start-rate-limit";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";

export const runtime = "nodejs";

type CliSessionStartDeps = {
	consumeStartBudget: (
		request: Request,
	) => Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
	createPendingSession: () => Promise<{
		sessionId: string;
		pollSecret: string;
		userCode: string;
		expiresAtISO: string;
		intervalMs: number;
	}>;
	resolveVerificationUrl: (request: Request, sessionId: string) => string;
	telemetry: ConnectTelemetry;
};

function defaultVerificationUrl(request: Request, sessionId: string): string {
	const envBase = process.env.BARDO_APP_BASE_URL?.trim();
	if (envBase) {
		return new URL(`/dashboard/connect/cli/${sessionId}`, envBase).toString();
	}
	return new URL(`/dashboard/connect/cli/${sessionId}`, request.url).toString();
}

const defaultDeps: CliSessionStartDeps = {
	consumeStartBudget: async (request) =>
		getDefaultCliSessionStartRateLimiter().consume(request),
	createPendingSession: async () => getDefaultCliDeviceSessionService().start(),
	resolveVerificationUrl: defaultVerificationUrl,
	telemetry: getDefaultConnectTelemetry(),
};

export function createCliSessionStartPostHandler(
	overrides: Partial<CliSessionStartDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		try {
			const budget = await deps.consumeStartBudget(request);
			if (!budget.allowed) {
				deps.telemetry.increment("cli_session_start_failed");
				return NextResponse.json(
					{
						error:
							"Too many CLI session start requests. Wait before trying again.",
					},
					{
						status: 429,
						headers:
							typeof budget.retryAfterSeconds === "number"
								? {
										"retry-after": String(budget.retryAfterSeconds),
									}
								: undefined,
					},
				);
			}

			const session = await deps.createPendingSession();
			deps.telemetry.increment("cli_session_started");
			const verificationUrl = deps.resolveVerificationUrl(
				request,
				session.sessionId,
			);
			const pollUrl = new URL("/api/connect/cli-session/poll", request.url);
			pollUrl.searchParams.set("sessionId", session.sessionId);
			pollUrl.searchParams.set("pollSecret", session.pollSecret);

			return NextResponse.json({
				sessionId: session.sessionId,
				userCode: session.userCode,
				verificationUrl,
				pollUrl: pollUrl.toString(),
				intervalMs: session.intervalMs,
				expiresAtISO: session.expiresAtISO,
			});
		} catch (error) {
			deps.telemetry.increment("cli_session_start_failed");
			if (isBackendAvailabilityError(error)) {
				return NextResponse.json(backendAvailabilityPayload(error), {
					status: 503,
				});
			}
			return NextResponse.json(
				{
					error: error instanceof Error ? error.message : String(error),
				},
				{ status: 500 },
			);
		}
	};
}

export const POST = createCliSessionStartPostHandler();
