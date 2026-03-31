import Link from "next/link";
import { createPublicMetadata } from "@/lib/site-metadata";
import { PublicPageShell } from "./_components/site-shells";

export const metadata = createPublicMetadata({
	title: "Bardo",
	description: "The MCP for any tabletop role-playing game.",
	path: "/",
});

export default function SitePage() {
	return (
		<PublicPageShell>
			<main className="w-full pt-0 sm:pt-10">
				<h1 className="font-reading-heading mb-1 text-2xl text-foreground">
					Bardo
				</h1>
				<p className="font-reading-body my-5 text-foreground">
					Bardo is the{" "}
					<Link
						href="/docs"
						className="underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
					>
						MCP for tabletop role-playing games
					</Link>
					. It keeps the useful parts small: docs, a blog, auth, and one
					protected dashboard for bridge approvals and billing.
				</p>
				<p className="font-reading-body my-5 text-foreground">
					It is built for game masters and players who want AI help without
					giving up control of their local files. Install the bridge, connect
					your client, approve access in the browser, and keep your campaign
					truth where it belongs.
				</p>
				<p className="font-reading-body my-5 text-foreground">
					Some of the most useful pages include:
				</p>
				<ul className="space-y-1 pl-0">
					<li className="list-none pl-1">
						<Link
							href="/docs/install"
							className="font-reading-body underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
						>
							Install
						</Link>
					</li>
					<li className="list-none pl-1">
						<Link
							href="/docs/connect-client"
							className="font-reading-body underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
						>
							Connect a client
						</Link>
					</li>
					<li className="list-none pl-1">
						<Link
							href="/dashboard"
							className="font-reading-body underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
						>
							Dashboard
						</Link>
					</li>
					<li className="list-none pl-1">
						<Link
							href="/blog"
							className="font-reading-body underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
						>
							Blog
						</Link>
					</li>
				</ul>
				<p className="font-reading-body my-5 text-foreground">
					You can read the{" "}
					<Link
						href="/docs"
						className="underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
					>
						docs
					</Link>
					, open the{" "}
					<Link
						href="/dashboard"
						className="underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
					>
						dashboard
					</Link>
					,{" "}
					<Link
						href="/sign-in"
						className="underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
					>
						sign in
					</Link>
					, or{" "}
					<Link
						href="/sign-up"
						className="underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
					>
						create an account
					</Link>
					. If you need the rules of the service, they live under{" "}
					<Link
						href="/legal"
						className="underline decoration-border underline-offset-[2.5px] transition-colors hover:decoration-foreground"
					>
						legal
					</Link>
					.
				</p>
			</main>
		</PublicPageShell>
	);
}
