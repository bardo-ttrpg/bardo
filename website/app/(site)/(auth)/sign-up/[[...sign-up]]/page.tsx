import { SignUp } from "@clerk/nextjs";
import { BardoViewTransition } from "@/components/view-transition";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { createPrivateMetadata } from "@/lib/site-metadata";
import { ClerkMissingKeysNotice } from "../../_components/auth-shell";

export const metadata = createPrivateMetadata("Sign Up");

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function SignUpPage() {
	if (!IS_CLERK_CONFIGURED) {
		return <ClerkMissingKeysNotice />;
	}

	return (
		<BardoViewTransition name="bardo-page-region" variant="fade">
			<SignUp
				routing="hash"
				signInUrl="/sign-in"
				fallbackRedirectUrl="/dashboard"
			/>
		</BardoViewTransition>
	);
}
