import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { requestInitBootstrap } from "@/lib/mcp-orchestrator";
import { OnboardingClient } from "./onboarding-client";

export const metadata = {
	title: "Onboarding",
};

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

export default async function OnboardingPage() {
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
		return (
			<div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
				<p className="font-mono text-xs text-destructive">
					Bootstrap service is currently unavailable. Try again in a moment.
				</p>
			</div>
		);
	}
	if (bootstrap.status === "complete") {
		redirect("/dashboard");
	}

	return (
		<div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
			<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ First Run Bootstrap
			</p>
			<h1 className="mb-8 font-mono text-2xl uppercase tracking-tight">
				Initialize your GM intelligence
			</h1>
			<OnboardingClient initial={bootstrap} />
		</div>
	);
}
