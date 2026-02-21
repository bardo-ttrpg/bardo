"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function ConvexClientProvider({
	children,
	useClerk,
}: {
	children: ReactNode;
	useClerk: boolean;
}) {
	if (!convex) {
		return children;
	}

	if (!useClerk) {
		return <ConvexProvider client={convex}>{children}</ConvexProvider>;
	}

	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			{children}
		</ConvexProviderWithClerk>
	);
}
