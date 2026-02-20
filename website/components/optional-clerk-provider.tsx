"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

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

	return <ClerkProvider>{children}</ClerkProvider>;
}
