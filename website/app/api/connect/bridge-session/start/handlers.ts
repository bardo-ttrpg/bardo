import { NextResponse } from "next/server";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../../lib/backend-availability";
import { getDefaultBridgeSessionStartRateLimiter } from "../../../../../lib/bridge-session-start-rate-limit";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";
import { applyRateLimitHeaders } from "../../../../../lib/rate-limit-headers";

export const runtime = "nodejs";

type BridgeSessionStartDeps = {
	consumeStartBudget: (request: Request) => Promise<{
		allowed: boolean;
		retryAfterSeconds?: number;
		limit?: number;
		remaining?: number;
		resetEpochSeconds?: number;
	}>;
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
		return new URL(
			`/dashboard/connect/bridge/${sessionId}`,
			envBase,
		).toString();
	}
	return new URL(
		`/dashboard/connect/bridge/${sessionId}`,
		request.url,
	).toString();
}

const defaultDeps: BridgeSessionStartDeps = {
	consumeStartBudget: async (request) =>
		getDefaultBridgeSessionStartRateLimiter().consume(request),
	createPendingSession: async () => getDefaultCliDeviceSessionService().start(),
	resolveVerificationUrl: defaultVerificationUrl,
	telemetry: getDefaultConnectTelemetry(),
};

export function createBridgeSessionStartPostHandler(
	overrides: Partial<BridgeSessionStartDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		try {
			const budget = await deps.consumeStartBudget(request);
			if (!budget.allowed) {
				deps.telemetry.increment("bridge_session_start_failed");
				const response = NextResponse.json(
					{
						error:
							"Too many bridge session start requests. Wait before trying again.",
					},
					{ status: 429 },
				);
				applyRateLimitHeaders(response.headers, budget);
				return response;
			}

			const session = await deps.createPendingSession();
			deps.telemetry.increment("bridge_session_started");
			const verificationUrl = deps.resolveVerificationUrl(
				request,
				session.sessionId,
			);
			const pollUrl = new URL("/api/connect/bridge-session/poll", request.url);
			pollUrl.searchParams.set("sessionId", session.sessionId);
			pollUrl.searchParams.set("pollSecret", session.pollSecret);

			const response = NextResponse.json({
				sessionId: session.sessionId,
				userCode: session.userCode,
				verificationUrl,
				pollUrl: pollUrl.toString(),
				intervalMs: session.intervalMs,
				expiresAtISO: session.expiresAtISO,
			});
			applyRateLimitHeaders(response.headers, budget);
			return response;
		} catch (error) {
			deps.telemetry.increment("bridge_session_start_failed");
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

export const POST = createBridgeSessionStartPostHandler();
