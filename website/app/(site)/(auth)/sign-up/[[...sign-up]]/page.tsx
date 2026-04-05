import { SignUp } from "@clerk/nextjs";
import { TransitionLink } from "@/components/transition-link";
import { BardoViewTransition } from "@/components/view-transition";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { createPrivateMetadata } from "@/lib/site-metadata";
import {
	AuthPageShell,
	ClerkMissingKeysNotice,
} from "../../_components/auth-shell";

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
		<AuthPageShell
			title="Create your account."
			description="Start with the smallest possible auth surface, then continue directly into the protected dashboard."
		>
			<BardoViewTransition name="bardo-page-region">
				<div className="space-y-5">
					<SignUp
						appearance={clerkAppearance}
						routing="hash"
						signInUrl="/sign-in"
						fallbackRedirectUrl="/dashboard"
					/>
					<p className="font-reading-body text-muted-foreground">
						Already have an account?{" "}
						<TransitionLink
							href="/sign-in"
							className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
						>
							Sign in
						</TransitionLink>
						.
					</p>
				</div>
			</BardoViewTransition>
		</AuthPageShell>
	);
}
