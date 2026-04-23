import { NextResponse } from "next/server";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../../lib/backend-availability";
import { getDefaultBridgeSessionPollRateLimiter } from "../../../../../lib/bridge-session-poll-rate-limit";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";
import { applyRateLimitHeaders } from "../../../../../lib/rate-limit-headers";

type BridgeSessionPollDeps = {
	consumeBudget: (request: Request) => Promise<{
		allowed: boolean;
		retryAfterSeconds?: number;
		limit?: number;
		remaining?: number;
		resetEpochSeconds?: number;
	}>;
	pollSession: (args: {
		sessionId: string;
		pollSecret: string;
	}) => Promise<
		| { status: "pending"; intervalMs: number }
		| { status: "approved"; payload: Record<string, unknown> }
		| { status: "denied"; error: string }
		| { status: "expired" | "consumed" | "invalid" }
	>;
	telemetry: ConnectTelemetry;
};

const defaultDeps: BridgeSessionPollDeps = {
	consumeBudget: async (request) =>
		getDefaultBridgeSessionPollRateLimiter().consume(request),
	pollSession: async (args) => getDefaultCliDeviceSessionService().poll(args),
	telemetry: getDefaultConnectTelemetry(),
};

export function createBridgeSessionPollGetHandler(
	overrides: Partial<BridgeSessionPollDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function GET(request: Request) {
		const url = new URL(request.url);
		const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
		const pollSecret = url.searchParams.get("pollSecret")?.trim() ?? "";
		if (!sessionId || !pollSecret) {
			return NextResponse.json(
				{ error: "Missing sessionId or pollSecret." },
				{ status: 400 },
			);
		}

		try {
			const budget = await deps.consumeBudget(request);
			if (!budget.allowed) {
				deps.telemetry.increment("bridge_session_poll_rejected");
				const response = NextResponse.json(
					{
						error:
							"Too many bridge session poll requests. Wait before trying again.",
					},
					{ status: 429 },
				);
				applyRateLimitHeaders(response.headers, budget);
				return response;
			}

			const result = await deps.pollSession({ sessionId, pollSecret });
			if (result.status === "approved") {
				deps.telemetry.increment("bridge_session_poll_approved");
				const response = NextResponse.json({
					status: "approved",
					...result.payload,
				});
				applyRateLimitHeaders(response.headers, budget);
				return response;
			}
			if (result.status === "pending") {
				deps.telemetry.increment("bridge_session_poll_pending");
				const response = NextResponse.json({
					status: "pending",
					intervalMs: result.intervalMs,
				});
				applyRateLimitHeaders(response.headers, budget);
				return response;
			}
			if (result.status === "denied") {
				deps.telemetry.increment("bridge_session_poll_rejected");
				const response = NextResponse.json(
					{ error: result.error },
					{ status: 403 },
				);
				applyRateLimitHeaders(response.headers, budget);
				return response;
			}
			if (result.status === "invalid") {
				deps.telemetry.increment("bridge_session_poll_rejected");
				return NextResponse.json(
					{ error: "Invalid poll secret." },
					{ status: 401 },
				);
			}
			if (result.status === "consumed") {
				deps.telemetry.increment("bridge_session_poll_rejected");
				return NextResponse.json(
					{ error: "Bridge session has already been consumed." },
					{ status: 409 },
				);
			}
			deps.telemetry.increment("bridge_session_poll_rejected");
			return NextResponse.json(
				{ error: "Bridge session expired or was not found." },
				{ status: 410 },
			);
		} catch (error) {
			deps.telemetry.increment("bridge_session_poll_failed");
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

export const GET = createBridgeSessionPollGetHandler();
