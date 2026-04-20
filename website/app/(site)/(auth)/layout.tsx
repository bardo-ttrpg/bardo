import type { ReactNode } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { SiteBrandHeaderFrame } from "../_components/site-shells";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<div>
			<SiteBrandHeaderFrame />
			<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
				<main className="flex items-center justify-center py-10 sm:h-[80dvh] sm:py-0">
					{children}
				</main>
			</OptionalClerkProvider>
		</div>
	);
}
