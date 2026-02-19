import { SignUp } from "@clerk/nextjs";
import { isClerkPublishableKeyConfigured } from "@/lib/clerk-config";

export const metadata = {
	title: "Sign up",
};

const IS_CLERK_CONFIGURED = isClerkPublishableKeyConfigured(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default function SignUpPage() {
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
						Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in{" "}
						<code>.env.local</code> and restart the dev server.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[calc(100vh-2.75rem)] items-center justify-center">
			<SignUp
				path="/sign-up"
				routing="path"
				signInUrl="/sign-in"
				forceRedirectUrl="/dashboard"
			/>
		</div>
	);
}
