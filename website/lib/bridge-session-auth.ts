import { resolveBridgeLoginSecret } from "./bridge-login-secret";
import { createBridgeSessionTokenCodec } from "./bridge-session-token";
import type { PlanTier } from "./user-billing";

export type BridgeSessionCredentialBundle = {
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
	mcpBaseUrl: string;
	statusUrl: string;
	refreshUrl: string;
	plan: PlanTier;
	accountLabel: string;
	serverName: string;
	issuedAtISO: string;
};

function createCodec(env: Record<string, string | undefined>) {
	const secret = resolveBridgeLoginSecret(env);
	return secret ? createBridgeSessionTokenCodec(secret) : null;
}

export async function createBridgeSessionCredentialBundle(args: {
	env?: Record<string, string | undefined>;
	sessionId: string;
	userId: string;
	plan: PlanTier;
	accountLabel: string;
	now: Date;
	mcpBaseUrl: string;
	statusUrl: string;
	refreshUrl: string;
	serverName?: string;
	accessTtlMs?: number;
	refreshTtlMs?: number;
}): Promise<BridgeSessionCredentialBundle> {
	const env = args.env ?? process.env;
	const codec = createCodec(env);
	if (!codec) {
		throw new Error(
			"Bridge session auth is not configured. Set BARDO_BRIDGE_LOGIN_SECRET.",
		);
	}

	const issuedAtISO = args.now.toISOString();
	const expiresAt = new Date(
		args.now.getTime() + (args.accessTtlMs ?? 10 * 60 * 1000),
	).toISOString();
	const refreshExpiresAt = new Date(
		args.now.getTime() + (args.refreshTtlMs ?? 30 * 24 * 60 * 60 * 1000),
	).toISOString();

	const commonPayload = {
		sessionId: args.sessionId,
		userId: args.userId,
		plan: args.plan,
		accountLabel: args.accountLabel,
		issuedAtISO,
	};

	return {
		accessToken: await codec.encrypt({
			tokenType: "access",
			...commonPayload,
			expiresAtISO: expiresAt,
		}),
		refreshToken: await codec.encrypt({
			tokenType: "refresh",
			...commonPayload,
			expiresAtISO: refreshExpiresAt,
		}),
		expiresAt,
		mcpBaseUrl: args.mcpBaseUrl,
		statusUrl: args.statusUrl,
		refreshUrl: args.refreshUrl,
		plan: args.plan,
		accountLabel: args.accountLabel,
		serverName: args.serverName ?? "bardo",
		issuedAtISO,
	};
}

export async function decodeBridgeAccessToken(args: {
	token: string;
	env?: Record<string, string | undefined>;
	now?: Date;
}) {
	const codec = createCodec(args.env ?? process.env);
	if (!codec) {
		return null;
	}

	return await codec.decryptAccess(args.token, {
		now: args.now,
	});
}

export async function decodeBridgeRefreshToken(args: {
	token: string;
	env?: Record<string, string | undefined>;
	now?: Date;
}) {
	const codec = createCodec(args.env ?? process.env);
	if (!codec) {
		return null;
	}

	return await codec.decryptRefresh(args.token, {
		now: args.now,
	});
}
