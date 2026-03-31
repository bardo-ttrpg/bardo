import { NextResponse } from "next/server";
import {
	type BillingSnapshot,
	createBillingAdminClient,
} from "../../../../../lib/billing-admin";
import {
	createBridgeSessionCredentialBundle,
	decodeBridgeRefreshToken,
} from "../../../../../lib/bridge-session-auth";

type BridgeSessionRefreshDeps = {
	readBillingSnapshot: (userId: string) => Promise<BillingSnapshot>;
	decodeRefreshToken: (token: string) => Promise<{
		sessionId: string;
		userId: string;
		accountLabel: string;
	} | null>;
	createBridgeCredentials: (args: {
		sessionId: string;
		userId: string;
		accountLabel: string;
		plan: BillingSnapshot["plan"];
		now: Date;
		mcpBaseUrl: string;
		statusUrl: string;
		refreshUrl: string;
	}) => Promise<{
		accessToken: string;
		refreshToken: string;
		expiresAt: string;
		mcpBaseUrl: string;
		statusUrl: string;
		refreshUrl: string;
		plan: BillingSnapshot["plan"];
		accountLabel: string;
		serverName: string;
		issuedAtISO: string;
	}>;
	resolveMcpBaseUrl: (request: Request) => string;
	resolveStatusUrl: (request: Request) => string;
	resolveRefreshUrl: (request: Request) => string;
	now: () => Date;
};

function resolveMcpBaseUrl(request: Request): string {
	const envBase =
		process.env.BARDO_MCP_BASE_URL?.trim() ||
		process.env.NEXT_PUBLIC_MCP_BASE_URL?.trim();
	if (envBase) {
		return envBase.replace(/\/+$/g, "");
	}
	const url = new URL(request.url);
	return `${url.protocol}//${url.host}`;
}

function resolveStatusUrl(request: Request): string {
	const envValue = process.env.BARDO_RUNTIME_STATUS_URL?.trim();
	if (envValue) {
		return envValue;
	}
	return new URL("/api/connect/runtime-status", request.url).toString();
}

function resolveRefreshUrl(request: Request): string {
	const envValue = process.env.BARDO_BRIDGE_SESSION_REFRESH_URL?.trim();
	if (envValue) {
		return envValue;
	}
	return new URL("/api/connect/bridge-session/refresh", request.url).toString();
}

const defaultDeps: BridgeSessionRefreshDeps = {
	readBillingSnapshot: async (userId) =>
		await createBillingAdminClient().readBillingSnapshot(userId),
	decodeRefreshToken: async (token) =>
		await decodeBridgeRefreshToken({ token }).catch(() => null),
	createBridgeCredentials: async (args) =>
		await createBridgeSessionCredentialBundle({
			sessionId: args.sessionId,
			userId: args.userId,
			accountLabel: args.accountLabel,
			plan: args.plan,
			now: args.now,
			mcpBaseUrl: args.mcpBaseUrl,
			statusUrl: args.statusUrl,
			refreshUrl: args.refreshUrl,
		}),
	resolveMcpBaseUrl,
	resolveStatusUrl,
	resolveRefreshUrl,
	now: () => new Date(),
};

export function createBridgeSessionRefreshPostHandler(
	overrides: Partial<BridgeSessionRefreshDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		const body = (await request.json().catch(() => ({}))) as Partial<{
			refreshToken: string;
		}>;
		const refreshToken = body.refreshToken?.trim();
		if (!refreshToken) {
			return NextResponse.json(
				{ error: "Missing refreshToken." },
				{ status: 400 },
			);
		}

		const decoded = await deps.decodeRefreshToken(refreshToken);
		if (!decoded) {
			return NextResponse.json(
				{ error: "Invalid refresh token." },
				{ status: 401 },
			);
		}

		const billing = await deps.readBillingSnapshot(decoded.userId);
		if (billing.billingUnavailable || billing.plan === "free") {
			return NextResponse.json(
				{
					error:
						"An active subscription is required before a bridge can connect to Bardo.",
				},
				{ status: 403 },
			);
		}

		const nextBundle = await deps.createBridgeCredentials({
			sessionId: decoded.sessionId,
			userId: decoded.userId,
			accountLabel: decoded.accountLabel,
			plan: billing.plan,
			now: deps.now(),
			mcpBaseUrl: deps.resolveMcpBaseUrl(request),
			statusUrl: deps.resolveStatusUrl(request),
			refreshUrl: deps.resolveRefreshUrl(request),
		});

		return NextResponse.json(nextBundle);
	};
}

export const POST = createBridgeSessionRefreshPostHandler();
