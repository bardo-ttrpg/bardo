"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { clerkAppearance } from "@/lib/clerk-appearance";

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
