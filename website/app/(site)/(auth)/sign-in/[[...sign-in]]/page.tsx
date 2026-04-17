import { SignIn } from "@clerk/nextjs";
import { BardoViewTransition } from "@/components/view-transition";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { createPrivateMetadata } from "@/lib/site-metadata";
import { ClerkMissingKeysNotice } from "../../_components/auth-shell";

export const metadata = createPrivateMetadata("Sign In");

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function SignInPage() {
	if (!IS_CLERK_CONFIGURED) {
		return <ClerkMissingKeysNotice />;
	}

	return (
		<BardoViewTransition name="bardo-page-region" variant="fade">
			<SignIn
				appearance={clerkAppearance}
				routing="hash"
				signUpUrl="/sign-up"
				fallbackRedirectUrl="/dashboard"
			/>
		</BardoViewTransition>
	);
}
