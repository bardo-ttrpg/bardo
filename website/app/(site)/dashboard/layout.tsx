import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ConvexClientProvider from "@/components/convex-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { requestInitBootstrap } from "@/lib/mcp-orchestrator";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

export default async function DashboardLayout({
	children,
}: {
	children: ReactNode;
}) {
	if (!IS_CLERK_CONFIGURED) {
		redirect("/");
	}

	const { userId, redirectToSignIn } = await auth();
	if (!userId) {
		return redirectToSignIn();
	}

	let bootstrap: Awaited<ReturnType<typeof requestInitBootstrap>>;
	try {
		bootstrap = await requestInitBootstrap();
	} catch {
		redirect("/");
	}

	if (bootstrap.status !== "complete") {
		redirect("/onboarding");
	}

	return <ConvexClientProvider useClerk>{children}</ConvexClientProvider>;
}
