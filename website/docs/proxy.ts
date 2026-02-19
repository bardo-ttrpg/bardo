import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isClerkAuthConfigured } from "./lib/clerk-config";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const IS_CLERK_AUTH_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default clerkMiddleware(async (auth, req) => {
	if (!IS_CLERK_AUTH_CONFIGURED) {
		return;
	}

	if (isProtectedRoute(req)) {
		await auth.protect();
	}
});

export const config = {
	matcher: ["/dashboard(.*)"],
};
