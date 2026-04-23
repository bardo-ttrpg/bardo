import { TransitionLink } from "@/components/transition-link";
import { Button } from "@/components/ui/button";

const homeActionClassName = "home-action-button";
const homeActionOutlineClassName = `${homeActionClassName} border-border hover:border-primary hover:bg-transparent hover:text-primary`;

export function HomePrimaryAction() {
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
		<Button
			asChild
			variant="outline"
			size="sm"
			className={homeActionOutlineClassName}
		>
			<TransitionLink
				href={href}
				transitionTypes={
					href === "/dashboard"
						? ["bardo-route", "dashboard-entry"]
						: ["bardo-route"]
				}
			>
				{children}
			</TransitionLink>
		</Button>
	);
}
