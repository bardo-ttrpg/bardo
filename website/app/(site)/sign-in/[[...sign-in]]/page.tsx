import { SignIn } from "@clerk/nextjs";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { createPrivateMetadata } from "@/lib/site-metadata";

export const metadata = createPrivateMetadata("Sign In");

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function SignInPage() {
	if (!IS_CLERK_CONFIGURED) {
		return (
			<div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
				<div className="max-w-2xl border border-border p-8">
					<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ Auth config required
					</p>
					<h1 className="mb-3 text-xl font-semibold text-foreground">
						Clerk publishable key is missing
					</h1>
					<p className="text-sm text-muted-foreground">
						Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
						<code>CLERK_SECRET_KEY</code> in <code>.env.local</code>, then
						restart the dev server.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[calc(100vh-2.75rem)] items-center justify-center">
			<SignIn
				path="/sign-in"
				routing="path"
				signUpUrl="/sign-up"
				fallbackRedirectUrl="/dashboard"
			/>
		</div>
	);
}
