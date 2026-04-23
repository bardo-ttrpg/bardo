"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

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
		<html lang="en">
			<body className="bg-background text-foreground">
				<main className="mx-auto flex min-h-svh w-full max-w-5xl px-6 sm:px-8">
					<section className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-8 pb-12 pt-8 sm:pb-16 sm:pt-8 lg:pb-20 lg:pt-10">
						<header className="flex flex-col gap-4 border-b border-border pb-6">
							<p className="ui-label text-muted-foreground">
								Application Error
							</p>
							<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
								Something went wrong.
							</h1>
							<p className="font-reading-body text-muted-foreground">
								A render failure reached the app root. Try the page again, or
								head back home if you want a clean restart.
							</p>
						</header>

						<footer className="flex flex-wrap items-center gap-4 text-sm">
							<Button type="button" onClick={reset} variant="outline">
								Try again
							</Button>
							<Link href="/" className="underline underline-offset-4">
								Go Back Home
							</Link>
						</footer>
					</section>
				</main>
			</body>
		</html>
	);
}
