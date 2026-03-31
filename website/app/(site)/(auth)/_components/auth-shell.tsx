import type { ReactNode } from "react";
import { PublicPageHeader } from "../../_components/site-shells";

export function AuthPageShell({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-10">
			<PublicPageHeader
				eyebrow="Account"
				title={title}
				description={description}
			/>
			{children}
		</div>
	);
}

export function ClerkMissingKeysNotice() {
	return (
		<div className="space-y-6 border border-border bg-card p-6">
			<p className="ui-label text-muted-foreground">Account</p>
			<h1 className="font-reading-heading text-3xl text-foreground">
				Clerk publishable key is missing.
			</h1>
			<p className="font-reading-body text-foreground">
				Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
				<code>CLERK_SECRET_KEY</code> in <code>.env.local</code>, then restart
				the dev server.
			</p>
		</div>
	);
}
