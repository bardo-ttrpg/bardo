import { NextResponse } from "next/server";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";

export const runtime = "nodejs";

type CliSessionStartDeps = {
	createPendingSession: () => Promise<{
		sessionId: string;
		pollSecret: string;
		userCode: string;
		expiresAtISO: string;
		intervalMs: number;
	}>;
	resolveVerificationUrl: (request: Request, sessionId: string) => string;
};

function defaultVerificationUrl(request: Request, sessionId: string): string {
	const envBase = process.env.BARDO_APP_BASE_URL?.trim();
	if (envBase) {
		return new URL(`/dashboard/connect/cli/${sessionId}`, envBase).toString();
	}
	return new URL(`/dashboard/connect/cli/${sessionId}`, request.url).toString();
}

const defaultDeps: CliSessionStartDeps = {
	createPendingSession: async () => getDefaultCliDeviceSessionService().start(),
	resolveVerificationUrl: defaultVerificationUrl,
};

export function createCliSessionStartPostHandler(
	overrides: Partial<CliSessionStartDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		try {
			const session = await deps.createPendingSession();
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
