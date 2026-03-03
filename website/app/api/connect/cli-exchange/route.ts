import { NextResponse } from "next/server";
import {
	CliLoginReplayStoreError,
	createCliLoginTokenStore,
} from "../../../../lib/cli-login-store";
import {
	type CliLoginExchangePayload,
	createCliLoginTokenCodec,
} from "../../../../lib/cli-login-token";

export const runtime = "nodejs";

type CliExchangeDeps = {
	decodeToken: (
		token: string,
	) => Promise<CliLoginExchangePayload> | CliLoginExchangePayload;
	consumeToken: (args: {
		token: string;
		expiresAtISO: string;
	}) => Promise<{ ok: boolean; reason?: "expired" | "already_used" }>;
};

function parseBody(request: Request): Promise<{ token?: string }> {
	return request
		.json()
		.then((body) => body as { token?: string })
		.catch(() => ({}));
}

const defaultDeps: CliExchangeDeps = {
	decodeToken: async (token) => {
		const secret = process.env.BARDO_CLI_LOGIN_SECRET?.trim();
		if (!secret) {
			throw new Error("CLI login exchange is not configured.");
		}
		return createCliLoginTokenCodec(secret).decrypt(token);
	},
	consumeToken: createCliLoginTokenStore().consume,
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
				const status = consumeResult.reason === "already_used" ? 409 : 401;
				const message =
					consumeResult.reason === "already_used"
						? "This CLI login token has already been used."
						: "This CLI login token has expired.";
				return NextResponse.json({ error: message }, { status });
			}
			return NextResponse.json(payload);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const status = error instanceof CliLoginReplayStoreError ? 500 : 401;
			return NextResponse.json({ error: message }, { status });
		}
	};
}

export const POST = createCliExchangePostHandler();
