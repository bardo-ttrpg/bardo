import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
	type NextFetchEvent,
	type NextRequest,
	NextResponse,
} from "next/server";
import { isClerkAuthConfigured } from "./lib/clerk-config";
import { shouldUseClerkOnlyProxyPathname } from "./lib/proxy-config";
import { resolveProxyLocalhostRedirectTarget } from "./lib/proxy-localhost";

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
	const targetHost = resolveProxyLocalhostRedirectTarget({
		forwardedHostHeader,
		hostHeader,
		requestUrl: request.url,
		nextUrlHost: request.nextUrl.host,
		appUrl: process.env.NEXT_PUBLIC_APP_URL,
	});
	if (!targetHost) {
		return null;
	}

	const redirectUrl = new URL(request.url);
	redirectUrl.hostname = targetHost;
	const hostHeaderPort =
		forwardedHostHeader?.split(",")[0]?.trim().split(":")[1]?.trim() ||
		hostHeader?.split(",")[0]?.trim().split(":")[1]?.trim() ||
		requestUrl.port ||
		"";
	if (hostHeaderPort) {
		redirectUrl.port = hostHeaderPort;
	}
	return NextResponse.redirect(redirectUrl, 307);
}

export default async function proxy(
	request: NextRequest,
	event: NextFetchEvent,
) {
	const isClerkOnlyPath = shouldUseClerkOnlyProxyPathname(
		request.nextUrl.pathname,
	);
	if (isClerkOnlyPath) {
		if (!IS_CLERK_AUTH_CONFIGURED) {
			return NextResponse.next();
		}

		const clerkResult = await clerkHandler(request, event);
		return clerkResult instanceof Response ? clerkResult : NextResponse.next();
	}

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
		{
			source:
				"/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
		"/(api|trpc)(.*)",
	],
};
