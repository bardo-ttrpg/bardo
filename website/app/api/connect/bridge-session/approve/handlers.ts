import { NextResponse } from "next/server";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../../lib/backend-availability";
import {
	type BillingSnapshot,
	createBillingAdminClient,
} from "../../../../../lib/billing-admin";
import {
	type BridgeSessionCredentialBundle,
	createBridgeSessionCredentialBundle,
} from "../../../../../lib/bridge-session-auth";
import { resolveRouteUserId } from "../../../../../lib/clerk-route-auth";
import { getDefaultCliDeviceSessionService } from "../../../../../lib/cli-device-session";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../../lib/connect-telemetry";

type BridgeSessionApproveDeps = {
	resolveUserId: (request: Request) => Promise<{
		has?: (params: { plan?: string }) => boolean;
		userId: string | null;
		response?: Response;
	}>;
	readBillingSnapshot: (userId: string) => Promise<BillingSnapshot>;
	approveSession: (args: {
		sessionId: string;
		payload: BridgeSessionCredentialBundle;
	}) => Promise<{ ok: boolean; reason?: "missing" | "expired" | "consumed" }>;
	denySession: (args: {
		sessionId: string;
		reason: string;
	}) => Promise<{ ok: boolean; reason?: "missing" | "expired" | "consumed" }>;
	createBridgeCredentials: (args: {
		sessionId: string;
		userId: string;
		plan: BillingSnapshot["plan"];
		now: Date;
		statusUrl: string;
		refreshUrl: string;
	}) => Promise<BridgeSessionCredentialBundle>;
	resolveStatusUrl: (request: Request) => string;
	resolveRefreshUrl: (request: Request) => string;
	now: () => Date;
	telemetry: ConnectTelemetry;
};

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

function statusFromError(error: unknown): number {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number"
	) {
		const status = (error as { status: number }).status;
		if (status >= 400 && status < 600) {
			return status;
		}
	}
	return 500;
}

function hasSubscription(snapshot: BillingSnapshot): boolean {
	return snapshot.plan === "pro";
}

const ACTIVE_PRO_REQUIRED_MESSAGE =
	"An active Pro subscription is required before a bridge can connect to Bardo.";

const defaultDeps: BridgeSessionApproveDeps = {
	resolveUserId: async (request) => {
		void request;
		return resolveRouteUserId("/api/connect/bridge-session/approve");
	},
	readBillingSnapshot: async (userId) =>
		await createBillingAdminClient().readBillingSnapshot(userId),
	approveSession: async (args) =>
		getDefaultCliDeviceSessionService().approve(args),
	denySession: async (args) =>
		getDefaultCliDeviceSessionService().deny({
			sessionId: args.sessionId,
			error: args.reason,
		}),
	createBridgeCredentials: async (args) =>
		await createBridgeSessionCredentialBundle({
			sessionId: args.sessionId,
			userId: args.userId,
			plan: args.plan,
			accountLabel: args.userId,
			now: args.now,
			statusUrl: args.statusUrl,
			refreshUrl: args.refreshUrl,
		}),
	resolveStatusUrl,
	resolveRefreshUrl,
	now: () => new Date(),
	telemetry: getDefaultConnectTelemetry(),
};

export function createBridgeSessionApprovePostHandler(
	overrides: Partial<BridgeSessionApproveDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		const authState = await deps.resolveUserId(request);
		if (authState.response) {
			return authState.response;
		}
		if (!authState.userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = (await request.json().catch(() => ({}))) as Partial<{
			sessionId: string;
		}>;
		const sessionId = body.sessionId?.trim();
		if (!sessionId) {
			return NextResponse.json(
				{ error: "Missing sessionId." },
				{ status: 400 },
			);
		}

		try {
			const billing = await deps.readBillingSnapshot(authState.userId);
			const hasProEntitlement = authState.has?.({ plan: "pro" }) ?? false;
			const effectivePlan =
				hasSubscription(billing) || hasProEntitlement ? "pro" : billing.plan;
			if (effectivePlan !== "pro" || billing.billingUnavailable) {
				await deps.denySession({
					sessionId,
					reason: ACTIVE_PRO_REQUIRED_MESSAGE,
				});
				deps.telemetry.increment("bridge_session_approve_rejected");
				return NextResponse.json(
					{
						error: ACTIVE_PRO_REQUIRED_MESSAGE,
					},
					{ status: 403 },
				);
			}

			const now = deps.now();
			const payload = await deps.createBridgeCredentials({
				sessionId,
				userId: authState.userId,
				plan: effectivePlan,
				now,
				statusUrl: deps.resolveStatusUrl(request),
				refreshUrl: deps.resolveRefreshUrl(request),
			});
			const approved = await deps.approveSession({
				sessionId,
				payload,
			});
			if (!approved.ok) {
				deps.telemetry.increment("bridge_session_approve_rejected");
				const status =
					approved.reason === "consumed"
						? 409
						: approved.reason === "expired"
							? 410
							: 404;
				return NextResponse.json(
					{ error: `Bridge session ${approved.reason ?? "failed"}.` },
					{ status },
				);
			}

			deps.telemetry.increment("bridge_session_approved");
			return NextResponse.json({ ok: true });
		} catch (error) {
			deps.telemetry.increment("bridge_session_approve_failed");
			if (isBackendAvailabilityError(error)) {
				return NextResponse.json(backendAvailabilityPayload(error), {
					status: 503,
				});
			}
			return NextResponse.json(
				{
					error: error instanceof Error ? error.message : String(error),
				},
				{ status: statusFromError(error) },
			);
		}
	};
}

export const POST = createBridgeSessionApprovePostHandler();
