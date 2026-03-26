"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export default function OptionalClerkProvider({
	children,
	enabled,
}: {
	children: ReactNode;
	enabled: boolean;
}) {
	if (!enabled) {
		return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
	}

	return (
		<ClerkProvider
			signInUrl="/sign-in"
			signUpUrl="/sign-up"
			signInFallbackRedirectUrl="/dashboard"
			signUpFallbackRedirectUrl="/dashboard"
			afterSignOutUrl="/"
		>
			<MotionConfig reducedMotion="user">{children}</MotionConfig>
		</ClerkProvider>
	);
}
