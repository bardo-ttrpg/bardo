import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { DashboardSignOutButton } from "./signout-button";

export const metadata = {
	title: "Dashboard",
};

const IS_CLERK_AUTH_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

export default async function DashboardPage() {
	if (!IS_CLERK_AUTH_CONFIGURED) {
		return (
			<div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
				<div className="max-w-2xl border border-border p-8">
					<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ Auth config required
					</p>
					<h1 className="mb-3 text-xl font-semibold text-foreground">
						Clerk is not fully configured
					</h1>
					<p className="text-sm text-muted-foreground">
						Set matching <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
						<code>CLERK_SECRET_KEY</code> plus{" "}
						<code>CLERK_JWT_ISSUER_DOMAIN</code> values in{" "}
						<code>.env.local</code>, then restart the dev server.
					</p>
				</div>
			</div>
		);
	}

	const { userId, redirectToSignIn } = await auth();

	if (!userId) {
		return redirectToSignIn();
	}

	return (
		<div className="mx-auto max-w-7xl px-4 sm:px-6">
			<div className="mt-12 max-w-2xl">
				{/* Label */}
				<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					/ Protected Workspace
				</p>
				<h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard</h1>
				<p className="mb-10 font-mono text-xs text-muted-foreground">
					{userId}
				</p>

				{/* Card */}
				<div className="border border-border">
					<div className="border-b border-border px-8 py-4">
						<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							/ Coming next
						</p>
					</div>
					<div className="p-8">
						<p className="mb-6 text-sm leading-relaxed text-muted-foreground">
							This placeholder confirms auth protection is active. Product
							controls and workspace management modules will be added in the
							next iteration.
						</p>
						<div className="flex flex-wrap gap-3">
							<Link
								href="/pricing"
								className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								View pricing ↗
							</Link>
							<DashboardSignOutButton />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
