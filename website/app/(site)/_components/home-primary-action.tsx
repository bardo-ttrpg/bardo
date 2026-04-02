import Link from "next/link";
import { Button } from "@/components/ui/button";
import { resolveOptionalUserId } from "@/lib/clerk-route-auth";

const homeActionClassName = "home-action-button";

export async function HomePrimaryAction({
	clerkEnabled,
}: {
	clerkEnabled: boolean;
}) {
	if (!clerkEnabled) {
		return <PrimaryHomeLink href="/sign-up">Sign Up</PrimaryHomeLink>;
	}

	const userId = await resolveOptionalUserId("/(site)/page");

	if (userId) {
		return (
			<Button
				asChild
				variant="outline"
				size="sm"
				className={`${homeActionClassName} border-border hover:bg-foreground hover:text-background`}
			>
				<Link href="/dashboard">Dashboard</Link>
			</Button>
		);
	}

	return <PrimaryHomeLink href="/sign-up">Sign Up</PrimaryHomeLink>;
}

function PrimaryHomeLink({
	href,
	children,
}: {
	href: string;
	children: string;
}) {
	return (
		<Button asChild size="sm" className={homeActionClassName}>
			<Link href={href}>{children}</Link>
		</Button>
	);
}
