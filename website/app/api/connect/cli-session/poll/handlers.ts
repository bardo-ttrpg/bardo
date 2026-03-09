import { NextResponse } from "next/server";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../../lib/backend-availability";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";

export const runtime = "nodejs";

type CliSessionPollDeps = {
	pollSession: (args: {
		sessionId: string;
		pollSecret: string;
	}) => Promise<
		| { status: "pending"; intervalMs: number }
		| { status: "approved"; payload: Record<string, unknown> }
		| { status: "expired" | "consumed" | "invalid" }
	>;
	telemetry: ConnectTelemetry;
};

const defaultDeps: CliSessionPollDeps = {
	pollSession: async (args) => getDefaultCliDeviceSessionService().poll(args),
	telemetry: getDefaultConnectTelemetry(),
};

export function createCliSessionPollGetHandler(
	overrides: Partial<CliSessionPollDeps> = {},
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
			const result = await deps.pollSession({ sessionId, pollSecret });
			if (result.status === "approved") {
				deps.telemetry.increment("cli_session_poll_approved");
				return NextResponse.json({
					status: "approved",
					...result.payload,
				});
			}
			if (result.status === "pending") {
				deps.telemetry.increment("cli_session_poll_pending");
				return NextResponse.json({
					status: "pending",
					intervalMs: result.intervalMs,
				});
			}
			if (result.status === "invalid") {
				deps.telemetry.increment("cli_session_poll_rejected");
				return NextResponse.json(
					{ error: "Invalid poll secret." },
					{ status: 401 },
				);
			}
			if (result.status === "consumed") {
				deps.telemetry.increment("cli_session_poll_rejected");
				return NextResponse.json(
					{ error: "CLI session has already been consumed." },
					{ status: 409 },
				);
			}
			deps.telemetry.increment("cli_session_poll_rejected");
			return NextResponse.json(
				{ error: "CLI session expired or was not found." },
				{ status: 410 },
			);
		} catch (error) {
			deps.telemetry.increment("cli_session_poll_failed");
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

export const GET = createCliSessionPollGetHandler();
