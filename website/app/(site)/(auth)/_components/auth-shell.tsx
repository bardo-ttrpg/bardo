export function ClerkMissingKeysNotice() {
	return (
		<section className="flex flex-col gap-6 border border-border bg-card p-6">
			<p className="ui-label text-muted-foreground">Account</p>
			<h1 className="font-reading-heading text-3xl text-foreground">
				Clerk publishable key is missing.
			</h1>
			<p className="font-reading-body text-foreground">
				Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
				<code>CLERK_SECRET_KEY</code> in <code>.env.local</code>, then restart
				the dev server.
			</p>
		</section>
	);
}
