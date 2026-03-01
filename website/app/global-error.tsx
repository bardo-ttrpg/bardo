"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang="en" className="dark">
			<body className="bg-background text-foreground">
				<main className="flex min-h-screen items-center justify-center px-6">
					<div className="w-full max-w-xl border border-border bg-card/80 p-8">
						<p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
							Global Error
						</p>
						<h1 className="mt-4 text-3xl font-semibold tracking-tight">
							Something went wrong
						</h1>
						<p className="mt-3 text-sm text-muted-foreground">
							A render failure reached the app root. The error was sent to
							Sentry.
						</p>
						<button
							type="button"
							onClick={reset}
							className="mt-6 border border-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:bg-foreground hover:text-background"
						>
							Try again
						</button>
					</div>
				</main>
			</body>
		</html>
	);
}
