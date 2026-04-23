import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const CLERK_MIDDLEWARE_DETECTION_FRAGMENT =
	"auth() was called but Clerk can't detect usage of clerkMiddleware()";

type AuthFn = typeof auth;
type ClerkAuthorizationCheck = (params: {
	feature?: string;
	permission?: string;
	plan?: string;
	role?: string;
}) => boolean;

type LoggerLike = {
	warn?(
		message: string,
		attributes?: Record<string, string | number | boolean>,
	): void;
};

const defaultLogger: LoggerLike = {
	warn(message, attributes) {
		console.warn(message, attributes ?? {});
	},
};

export function isClerkMiddlewareDetectionError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.includes(CLERK_MIDDLEWARE_DETECTION_FRAGMENT)
	);
}

export async function resolveRouteUserId(
	route: string,
	options: {
		authFn?: AuthFn;
		logger?: LoggerLike;
	} = {},
): Promise<{
	has?: ClerkAuthorizationCheck;
	response?: Response;
	userId: string | null;
}> {
	const authFn = options.authFn ?? auth;
	const logger = options.logger ?? defaultLogger;

	try {
		const { has, userId } = await authFn();
		const result: {
			has?: ClerkAuthorizationCheck;
			userId: string | null;
		} = { userId: userId ?? null };
		if (typeof has === "function") {
			result.has = has as ClerkAuthorizationCheck;
		}
		return result;
	} catch (error) {
		if (!isClerkMiddlewareDetectionError(error)) {
			throw error;
		}

		logger?.warn?.("website.auth.middleware_unavailable", {
			"bardo.service": "website",
			"bardo.route": route,
			"bardo.operation": "clerk.auth",
		});

		return {
			userId: null,
			response: NextResponse.json(
				{
					error:
						"Authentication middleware unavailable. Retry after the app proxy initializes.",
				},
				{ status: 503 },
			),
		};
	}
}

export async function resolveOptionalUserId(
	route: string,
	options: {
		authFn?: AuthFn;
		logger?: LoggerLike;
	} = {},
): Promise<string | null> {
	const result = await resolveRouteUserId(route, options);
	return result.userId;
}
