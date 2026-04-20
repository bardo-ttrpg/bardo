"use client";

import { useAuth } from "@clerk/nextjs";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { TransitionLink } from "@/components/transition-link";
import { Button } from "@/components/ui/button";
import { resolveHomePrimaryActionState } from "./home-primary-action-state";

const homeActionClassName = "home-action-button";
const homeActionOutlineClassName = `${homeActionClassName} border-border hover:border-primary hover:bg-transparent hover:text-primary`;

export function HomePrimaryAction({ clerkEnabled }: { clerkEnabled: boolean }) {
	if (!clerkEnabled) {
		return <PrimaryHomeLink href="/sign-up">Sign Up</PrimaryHomeLink>;
	}

	return (
		<OptionalClerkProvider enabled={true}>
			<ResolvedHomePrimaryAction />
		</OptionalClerkProvider>
	);
}

function ResolvedHomePrimaryAction() {
	const { isLoaded, isSignedIn } = useAuth();
	const actionState = resolveHomePrimaryActionState({
		clerkEnabled: true,
		isLoaded: isLoaded ?? false,
		isSignedIn: isSignedIn ?? false,
	});

	if (actionState === "dashboard") {
		return (
			<Button
				asChild
				variant="outline"
				size="sm"
				className={homeActionOutlineClassName}
			>
				<TransitionLink
					href="/dashboard"
					transitionTypes={["bardo-route", "dashboard-entry"]}
				>
					Dashboard
				</TransitionLink>
			</Button>
		);
	}

	if (actionState === "pending") {
		return <PrimaryHomeLink href="/dashboard">Account</PrimaryHomeLink>;
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
