import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { createPrivateMetadata } from "@/lib/site-metadata";
import {
	AuthPageShell,
	ClerkMissingKeysNotice,
} from "../../_components/auth-shell";

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
		<AuthPageShell
			title="Sign in."
			description="Use your existing Bardo account to open the dashboard and approve bridge sessions."
		>
			<div className="space-y-5">
				<SignIn
					appearance={clerkAppearance}
					path="/sign-in"
					routing="path"
					signUpUrl="/sign-up"
					fallbackRedirectUrl="/dashboard"
				/>
				<p className="font-reading-body text-muted-foreground">
					Forgot your password?{" "}
					<Link
						href="/forgot-password"
						className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
					>
						Reset it here
					</Link>
					.
				</p>
			</div>
		</AuthPageShell>
	);
}
