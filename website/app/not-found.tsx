import Link from "next/link";

export default function NotFound() {
	return (
		<div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-4 py-20 sm:px-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ 404
			</p>
			<h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
				This route is missing, but the campaign truth is still intact.
			</h1>
			<p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
				Try the install docs, campaign-truth guide, or pricing page to get back
				to the parts of Bardo that are meant to be public.
			</p>
			<div className="mt-8 flex flex-wrap gap-3">
				<Link
					href="/docs/install"
					prefetch={false}
					className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
				>
					Install Bardo
				</Link>
				<Link
					href="/docs/campaign-truth"
					prefetch={false}
					className="border border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
				>
					Read Campaign Truth
				</Link>
			</div>
		</div>
	);
}
