"use client";

import {
	ClerkLoaded,
	RedirectToSignIn,
	UserProfile,
	useUser,
} from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { BardoViewTransition } from "../../../components/view-transition";

export function DashboardClient() {
	const { isSignedIn } = useUser();

	return (
		<main>
			<BardoViewTransition name="bardo-page-region" variant="fade">
				<section
					className="flex justify-center items-center h-[80dvh] bardo-page-region auth-clerk-frame w-full"
					aria-label="Account dashboard"
				>
					<ClerkLoaded>
						{isSignedIn ? (
							<UserProfile
								appearance={clerkAppearance}
								path="/dashboard"
								routing="path"
							/>
						) : (
							<RedirectToSignIn />
						)}
					</ClerkLoaded>
				</section>
			</BardoViewTransition>
		</main>
	);
}
