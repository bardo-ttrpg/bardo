import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
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

	return (
		<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
			{children}
		</OptionalClerkProvider>
	);
}
