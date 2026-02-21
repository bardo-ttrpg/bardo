import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
	type NextFetchEvent,
	type NextRequest,
	NextResponse,
} from "next/server";
import {
	isClerkAuthConfigured,
	shouldResetClerkSessionForRequest,
} from "./lib/clerk-config";
import { shouldRedirectToCanonicalLocalhost } from "./lib/local-domain";

const isProtectedRoute = createRouteMatcher([
	"/dashboard(.*)",
	"/onboarding(.*)",
]);
const IS_CLERK_AUTH_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
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

function requestHostnameFromRequest(request: NextRequest): string {
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

	return requestHost.split(":")[0]?.trim() || request.nextUrl.hostname;
}

const KNOWN_CLERK_COOKIES = new Set(["__session", "__client_uat"]);

function isClerkCookieName(name: string): boolean {
	return KNOWN_CLERK_COOKIES.has(name) || name.startsWith("__clerk");
}

function staleClerkCookieNames(request: NextRequest): string[] {
	const clerkCookieNames = request.cookies
		.getAll()
		.map((cookie) => cookie.name)
		.filter(isClerkCookieName);
	if (clerkCookieNames.length === 0) {
		return [];
	}

	const sessionToken = request.cookies.get("__session")?.value ?? null;
	if (!sessionToken) {
		return [];
	}

	const shouldReset = shouldResetClerkSessionForRequest({
		sessionToken,
		issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
		requestHostname: requestHostnameFromRequest(request),
	});
	if (!shouldReset) {
		return [];
	}

	return clerkCookieNames;
}

function appendExpiredCookies(
	response: Response,
	cookieNames: string[],
): Response {
	if (cookieNames.length === 0) {
		return response;
	}

	const nextResponse = new Response(response.body, response);
	for (const cookieName of cookieNames) {
		nextResponse.headers.append(
			"Set-Cookie",
			`${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`,
		);
	}

	return nextResponse;
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
	const staleCookies = staleClerkCookieNames(request);

	const localDomainRedirect = maybeRedirectToCanonicalLocalhost(request);
	if (localDomainRedirect) {
		return appendExpiredCookies(localDomainRedirect, staleCookies);
	}

	if (!IS_CLERK_AUTH_CONFIGURED) {
		if (isProtectedRoute(request)) {
			const redirectUrl = new URL("/", request.url);
			return appendExpiredCookies(
				NextResponse.redirect(redirectUrl, 307),
				staleCookies,
			);
		}
		return appendExpiredCookies(passThroughMiddleware(request), staleCookies);
	}

	const clerkResult = await clerkHandler(request, event);
	const response =
		clerkResult instanceof Response ? clerkResult : NextResponse.next();
	return appendExpiredCookies(response, staleCookies);
}

export const config = {
	matcher: [
		// Skip Next.js internals and static files
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
