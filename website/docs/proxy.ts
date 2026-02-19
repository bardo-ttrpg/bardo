import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { isClerkAuthConfigured } from "./lib/clerk-config";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
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

export default IS_CLERK_AUTH_CONFIGURED ? clerkHandler : passThroughMiddleware;

export const config = {
	matcher: [
		// Skip Next.js internals and static files
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
