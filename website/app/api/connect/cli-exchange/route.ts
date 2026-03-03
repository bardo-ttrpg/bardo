import { NextResponse } from "next/server";
import {
	CliLoginReplayStoreError,
	createCliLoginTokenStore,
} from "../../../../lib/cli-login-store";
import {
	type CliLoginExchangePayload,
	createCliLoginTokenCodec,
} from "../../../../lib/cli-login-token";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../lib/connect-telemetry";

export const runtime = "nodejs";

type CliExchangeDeps = {
	decodeToken: (
		token: string,
	) => Promise<CliLoginExchangePayload> | CliLoginExchangePayload;
	consumeToken: (args: {
		token: string;
		expiresAtISO: string;
	}) => Promise<{ ok: boolean; reason?: "expired" | "already_used" }>;
	telemetry: ConnectTelemetry;
};

function parseBody(request: Request): Promise<{ token?: string }> {
	return request
		.json()
		.then((body) => body as { token?: string })
		.catch(() => ({}));
}

let defaultCliLoginTokenStore: ReturnType<
	typeof createCliLoginTokenStore
> | null = null;

function getDefaultCliLoginTokenStore() {
	defaultCliLoginTokenStore ??= createCliLoginTokenStore();
	return defaultCliLoginTokenStore;
}

const defaultDeps: CliExchangeDeps = {
	decodeToken: async (token) => {
		const secret = process.env.BARDO_CLI_LOGIN_SECRET?.trim();
		if (!secret) {
			throw new Error("CLI login exchange is not configured.");
		}
		return createCliLoginTokenCodec(secret).decrypt(token);
	},
	consumeToken: async (args) => getDefaultCliLoginTokenStore().consume(args),
	telemetry: getDefaultConnectTelemetry(),
};

export function createCliExchangePostHandler(
	overrides: Partial<CliExchangeDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		const body = await parseBody(request);
		const token = body.token?.trim();
		if (!token) {
			return NextResponse.json(
				{ error: "Missing login token." },
				{ status: 400 },
			);
		}

		try {
			const payload = await deps.decodeToken(token);
			const consumeResult = await deps.consumeToken({
				token,
				expiresAtISO: payload.expiresAtISO,
			});
			if (!consumeResult.ok) {
				deps.telemetry.increment("cli_exchange_rejected");
				const status = consumeResult.reason === "already_used" ? 409 : 401;
				const message =
					consumeResult.reason === "already_used"
						? "This CLI login token has already been used."
						: "This CLI login token has expired.";
				return NextResponse.json({ error: message }, { status });
			}
			deps.telemetry.increment("cli_exchange_success");
			return NextResponse.json(payload);
		} catch (error) {
			deps.telemetry.increment(
				error instanceof CliLoginReplayStoreError
					? "cli_exchange_failed"
					: "cli_exchange_rejected",
			);
			const message = error instanceof Error ? error.message : String(error);
			const status = error instanceof CliLoginReplayStoreError ? 500 : 401;
			return NextResponse.json({ error: message }, { status });
		}
	};
}

export const POST = createCliExchangePostHandler();
