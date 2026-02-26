import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

export const metadata = {
	title: "Sign up",
};

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

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
						Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
						<code>CLERK_SECRET_KEY</code> in <code>.env.local</code>, then
						restart the dev server.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-[calc(100vh-2.75rem)] w-full max-w-7xl flex-col items-center justify-center gap-5 px-4 py-10 sm:px-6">
			<SignUp
				path="/sign-up"
				routing="path"
				signInUrl="/sign-in"
				forceRedirectUrl="/dashboard"
			/>
			<p className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
				By creating an account, you agree to the{" "}
				<Link href="/legal/terms" className="underline underline-offset-2">
					Terms
				</Link>
				,{" "}
				<Link href="/legal/privacy" className="underline underline-offset-2">
					Privacy Policy
				</Link>
				, and{" "}
				<Link href="/legal/ai-policy" className="underline underline-offset-2">
					AI Use Policy
				</Link>
				.
			</p>
		</div>
	);
}
