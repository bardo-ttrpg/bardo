"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");

export default function ConvexClientProvider({
	children,
	useClerk,
}: {
	children: ReactNode;
	useClerk: boolean;
}) {
	if (!useClerk) {
		return <ConvexProvider client={convex}>{children}</ConvexProvider>;
	}

	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			{children}
		</ConvexProviderWithClerk>
	);
}
