import type { ReactNode } from "react";
import ConvexClientProvider from "@/components/convex-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

export default function DashboardLayout({ children }: { children: ReactNode }) {
	return (
		<ConvexClientProvider useClerk={IS_CLERK_CONFIGURED}>
			{children}
		</ConvexClientProvider>
	);
}
