import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { DashboardSignOutButton } from "./signout-button";

export const metadata = {
	title: "Dashboard",
};

export default async function DashboardPage() {
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
								href="/mpc-docs"
								className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
							>
								Go to docs ↗
							</Link>
							<DashboardSignOutButton />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
