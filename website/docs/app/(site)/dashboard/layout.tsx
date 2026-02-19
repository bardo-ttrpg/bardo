import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import ConvexClientProvider from "@/components/convex-provider";
import { isClerkPublishableKeyConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkPublishableKeyConfigured(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default function DashboardLayout({ children }: { children: ReactNode }) {
	const content = (
		<ConvexClientProvider useClerk={IS_CLERK_CONFIGURED}>
			{children}
		</ConvexClientProvider>
	);

	if (!IS_CLERK_CONFIGURED) {
		return content;
	}

	return <ClerkProvider>{content}</ClerkProvider>;
}
