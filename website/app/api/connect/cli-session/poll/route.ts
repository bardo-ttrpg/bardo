import { NextResponse } from "next/server";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";

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
};

const defaultDeps: CliSessionPollDeps = {
	pollSession: async (args) => getDefaultCliDeviceSessionService().poll(args),
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
				return NextResponse.json({
					status: "approved",
					...result.payload,
				});
			}
			if (result.status === "pending") {
				return NextResponse.json({
					status: "pending",
					intervalMs: result.intervalMs,
				});
			}
			if (result.status === "invalid") {
				return NextResponse.json(
					{ error: "Invalid poll secret." },
					{ status: 401 },
				);
			}
			if (result.status === "consumed") {
				return NextResponse.json(
					{ error: "CLI session has already been consumed." },
					{ status: 409 },
				);
			}
			return NextResponse.json(
				{ error: "CLI session expired or was not found." },
				{ status: 410 },
			);
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

export const GET = createCliSessionPollGetHandler();
