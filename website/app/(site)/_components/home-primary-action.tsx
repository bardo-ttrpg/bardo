"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { Button } from "@/components/ui/button";
import { resolveHomePrimaryActionState } from "./home-primary-action-state";

const homeActionClassName = "home-action-button";

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
				className={`${homeActionClassName} border-border hover:border-primary hover:bg-transparent hover:text-primary`}
			>
				<Link href="/dashboard">Dashboard</Link>
			</Button>
		);
	}

	if (actionState === "pending") {
		return (
			<Button
				size="sm"
				variant="outline"
				disabled
				aria-busy="true"
				className={`${homeActionClassName} border-border text-muted-foreground opacity-100`}
			>
				Account
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
