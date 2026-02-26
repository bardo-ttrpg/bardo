import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
	type NextFetchEvent,
	type NextRequest,
	NextResponse,
} from "next/server";
import { isClerkAuthConfigured } from "./lib/clerk-config";
import { shouldRedirectToCanonicalLocalhost } from "./lib/local-domain";

const isProtectedRoute = createRouteMatcher([
	"/dashboard(.*)",
	"/onboarding(.*)",
]);
const IS_CLERK_AUTH_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

const clerkHandler = clerkMiddleware(async (auth, req) => {
	if (!IS_CLERK_AUTH_CONFIGURED) {
		return;
	}

	if (isProtectedRoute(req)) {
		await auth.protect();
	}
});

function passThroughMiddleware(_request: NextRequest) {
	return NextResponse.next();
}

function maybeRedirectToCanonicalLocalhost(
	request: NextRequest,
): Response | null {
	const forwardedHostHeader = request.headers.get("x-forwarded-host");
	const hostHeader = request.headers.get("host");
	const requestUrl = new URL(request.url);
	const requestHostCandidates = [
		forwardedHostHeader?.split(",")[0]?.trim() || null,
		hostHeader?.split(",")[0]?.trim() || null,
		requestUrl.host || null,
		request.nextUrl.host || null,
	];
	const requestHost =
		requestHostCandidates.find(
			(value): value is string => typeof value === "string" && value.length > 0,
		) ?? "";
	const hostHeaderHostname = requestHost.split(":")[0]?.trim() || null;
	const hostHeaderPort =
		requestHost.split(":")[1]?.trim() || requestUrl.port || "";
	const targetHost = shouldRedirectToCanonicalLocalhost({
		requestHostname: hostHeaderHostname ?? request.nextUrl.hostname,
		requestUrlHostname: requestUrl.hostname,
		appUrl: process.env.NEXT_PUBLIC_APP_URL,
	});
	if (!targetHost) {
		return null;
	}

	const redirectUrl = new URL(request.url);
	redirectUrl.hostname = targetHost;
	if (hostHeaderPort) {
		redirectUrl.port = hostHeaderPort;
	}
	return NextResponse.redirect(redirectUrl, 307);
}

export default async function proxy(
	request: NextRequest,
	event: NextFetchEvent,
) {
	const localDomainRedirect = maybeRedirectToCanonicalLocalhost(request);
	if (localDomainRedirect) {
		return localDomainRedirect;
	}

	if (!IS_CLERK_AUTH_CONFIGURED) {
		if (isProtectedRoute(request)) {
			const redirectUrl = new URL("/", request.url);
			return NextResponse.redirect(redirectUrl, 307);
		}
		return passThroughMiddleware(request);
	}

	const clerkResult = await clerkHandler(request, event);
	return clerkResult instanceof Response ? clerkResult : NextResponse.next();
}

export const config = {
	matcher: [
		// Skip Next.js internals and static files
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
