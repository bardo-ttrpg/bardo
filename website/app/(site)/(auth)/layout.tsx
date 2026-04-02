import type { ReactNode } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { PublicPageShell } from "../_components/site-shells";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<PublicPageShell className="justify-center">
			<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
				<div className="w-full max-w-xl">{children}</div>
			</OptionalClerkProvider>
		</PublicPageShell>
	);
}
