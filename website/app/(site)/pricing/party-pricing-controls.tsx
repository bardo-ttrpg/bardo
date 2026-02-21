"use client";

import { useId, useMemo, useState } from "react";
import {
	formatUsdCents,
	normalizePartySeats,
	partyCreditsForSeats,
	partySeatPriceCents,
	partyTotalCentsForSeats,
	sanitizePartySeatsInput,
} from "@/lib/billing-catalog";
import type { BillingInterval } from "@/lib/user-billing";
import CheckoutButton from "./checkout-button";

export default function PartyPricingControls({
	yearly,
	interval,
	label,
	buttonClassName,
}: {
	yearly: boolean;
	interval: BillingInterval;
	label: string;
	buttonClassName: string;
}) {
	const seatInputId = useId();
	const [seatInput, setSeatInput] = useState("2");
	const seatCount = normalizePartySeats(seatInput);
	const monthlyCredits = partyCreditsForSeats(seatCount);
	const totalCents = partyTotalCentsForSeats(seatCount, yearly);
	const perLabel = yearly ? "/ yr" : "/ mo";
	const seatPriceLabel = useMemo(
		() => formatUsdCents(partySeatPriceCents(yearly)),
		[yearly],
	);

	return (
		<>
			<p className="mb-6 font-mono text-[10px] text-muted-foreground">
				{monthlyCredits.toLocaleString()} credits / month
			</p>

			<div className="mb-6 border border-border p-3">
				<label
					htmlFor={seatInputId}
					className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
				>
					Seats (2-100)
				</label>
				<input
					id={seatInputId}
					type="number"
					min={2}
					max={100}
					step={1}
					value={seatInput}
					onBlur={() => setSeatInput(String(seatCount))}
					onChange={(event) =>
						setSeatInput(sanitizePartySeatsInput(event.target.value))
					}
					className="w-full border border-border bg-transparent px-2 py-1.5 font-mono text-sm text-foreground outline-none ring-0"
				/>
				<p className="mt-2 font-mono text-[10px] text-muted-foreground">
					{formatUsdCents(totalCents)} total {perLabel}
				</p>
				<p className="mt-1 font-mono text-[10px] text-muted-foreground">
					{seatPriceLabel}
					{perLabel} / seat
				</p>
			</div>

			<CheckoutButton
				plan="party"
				interval={interval}
				quantity={seatCount}
				label={label}
				className={buttonClassName}
			/>
		</>
	);
}
