import Link from "next/link";
import CrosshairMarker from "@/components/crosshair-marker";

export default function CtaSection() {
	return (
		<section className="mx-auto max-w-7xl px-4 sm:px-6 [contain-intrinsic-size:420px] [content-visibility:auto]">
			<div className="relative mt-16 border border-border">
				<CrosshairMarker className="-left-[5px] -top-[8px]" />
				<CrosshairMarker className="-right-[5px] -top-[8px]" />
				<CrosshairMarker className="-bottom-[8px] -left-[5px]" />
				<CrosshairMarker className="-right-[5px] -bottom-[8px]" />
				<CrosshairMarker className="-top-[8px] left-[calc(50%-5px)]" />
				<CrosshairMarker className="-bottom-[8px] left-[calc(50%-5px)]" />

				<div className="grid grid-cols-1 sm:grid-cols-2">
					<div className="border-b border-border p-8 sm:border-b-0 sm:border-r">
						<p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							/ Get started
						</p>
						<p className="text-sm text-muted-foreground">
							One MCP server. Any agent. Any TTRPG system.
						</p>
					</div>
					<div className="flex items-center gap-4 p-8">
						<Link
							href="/mpc-docs"
							className="border border-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
						>
							Read the docs ↗
						</Link>
						<Link
							href="/sign-up"
							className="border border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
						>
							Sign up ↗
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
