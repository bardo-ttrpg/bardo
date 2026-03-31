"use client";

import { useEffect } from "react";
import { siteCode, siteReading, siteUi } from "@/lib/site-fonts";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[website] global render error", error);
	}, [error]);

	return (
		<html
			lang="en"
			className={`${siteReading.variable} ${siteUi.variable} ${siteCode.variable}`}
		>
			<body className="bg-background text-foreground">
				<main className="flex min-h-screen items-center justify-center px-6">
					<div className="w-full max-w-xl border border-border bg-card p-8">
						<p className="ui-label text-muted-foreground">Global Error</p>
						<h1 className="mt-4 font-reading-heading text-4xl text-foreground">
							Something went wrong.
						</h1>
						<p className="mt-3 font-reading-body text-muted-foreground">
							A render failure reached the app root. Check Vercel logs for the
							server-side details.
						</p>
						<button
							type="button"
							onClick={reset}
							className="ui-button mt-6 border border-foreground px-4 py-2 text-foreground transition-colors hover:bg-subtle"
						>
							Try again
						</button>
					</div>
				</main>
			</body>
		</html>
	);
}
