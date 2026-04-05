"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import type { ComponentProps, ReactNode } from "react";
import { clerkAppearance } from "@/lib/clerk-appearance";

// Clerk's ui bundle is runtime-compatible here, but its published types can lag the
// nextjs package by a patch and require a local narrowing to satisfy TypeScript.
const clerkUi = ui as unknown as NonNullable<
	ComponentProps<typeof ClerkProvider>["ui"]
>;

export default function OptionalClerkProvider({
	children,
	enabled,
}: {
	children: ReactNode;
	enabled: boolean;
}) {
	if (!enabled) {
		return children;
	}

	return (
		<ClerkProvider
			ui={clerkUi}
			appearance={clerkAppearance}
			signInUrl="/sign-in"
			signUpUrl="/sign-up"
			signInFallbackRedirectUrl="/dashboard"
			signUpFallbackRedirectUrl="/dashboard"
			afterSignOutUrl="/"
		>
			{children}
		</ClerkProvider>
	);
}
