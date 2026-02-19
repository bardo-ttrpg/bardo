import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { isClerkPublishableKeyConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkPublishableKeyConfigured(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default function SignInLayout({ children }: { children: ReactNode }) {
	if (!IS_CLERK_CONFIGURED) {
		return children;
	}

	return <ClerkProvider>{children}</ClerkProvider>;
}
