import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { createPrivateMetadata } from "@/lib/site-metadata";
import {
	AuthPageShell,
	ClerkMissingKeysNotice,
} from "../_components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = createPrivateMetadata("Forgot Password");

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function ForgotPasswordPage() {
	if (!IS_CLERK_CONFIGURED) {
		return <ClerkMissingKeysNotice />;
	}

	return (
		<AuthPageShell
			title="Reset your password."
			description="Request a verification code, confirm it, and set a new password without leaving the minimal auth surface."
		>
			<ForgotPasswordForm />
		</AuthPageShell>
	);
}
