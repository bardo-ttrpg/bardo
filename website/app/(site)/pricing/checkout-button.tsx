"use client";

import { useState } from "react";
import type { BillingInterval } from "@/lib/user-billing";

type CheckoutButtonProps = {
	plan: "solo" | "solo_plus" | "party";
	interval: BillingInterval;
	quantity?: number;
	label: string;
	className: string;
};

type CheckoutResponse = {
	url?: string;
	error?: string;
};

export default function CheckoutButton({
	plan,
	interval,
	quantity,
	label,
	className,
}: CheckoutButtonProps) {
	const [isPending, setIsPending] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function handleCheckout() {
		if (isPending) return;
		setErrorMessage(null);
		setIsPending(true);

		try {
			const response = await fetch("/api/billing/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ plan, interval, quantity }),
			});

			if (response.status === 401) {
				window.location.href = "/sign-in";
				return;
			}

			const payload = (await response.json()) as CheckoutResponse;
			if (!response.ok || !payload.url) {
				setErrorMessage(payload.error ?? "Unable to start checkout.");
				return;
			}

			window.location.href = payload.url;
		} catch {
			setErrorMessage("Unable to start checkout right now.");
		} finally {
			setIsPending(false);
		}
	}

	return (
		<div>
			<button
				type="button"
				onClick={handleCheckout}
				disabled={isPending}
				className={className}
			>
				{isPending ? "Redirecting..." : label}
			</button>
			{errorMessage ? (
				<p className="mt-2 text-xs text-red-500/80">{errorMessage}</p>
			) : null}
		</div>
	);
}
