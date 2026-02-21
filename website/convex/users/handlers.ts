import {
	buildBillingBackfillPatch,
	migrateLegacyPlanTier,
	normalizePartySeats,
	planCreditsFor,
	resolveBillingState,
} from "../../lib/user-billing";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	type ApplyStripeSubscriptionArgs,
	billingFieldsFromUser,
	type CompleteBillingEventArgs,
	type DowngradeToFreeArgs,
	findUserByClerkId,
	findUserByStripeCustomerId,
	type RecordInvoicePaymentArgs,
	type ReserveBillingEventArgs,
	resolveUserBillingView,
	type SetStripeCustomerIdArgs,
	THIRTY_DAYS_MS,
	type TrackMcpCallArgs,
	type UpsertUserArgs,
} from "./shared";

export async function upsertUserHandler(
	ctx: MutationCtx,
	args: UpsertUserArgs,
): Promise<string> {
	const existing = await findUserByClerkId(ctx, args.clerkId);
	const now = Date.now();

	if (existing) {
		const backfillPatch = buildBillingBackfillPatch(
			billingFieldsFromUser(existing),
			now,
		);
		await ctx.db.patch(existing._id, {
			email: args.email,
			imageUrl: args.imageUrl,
			name: args.name,
			updatedAt: now,
			...backfillPatch,
		});
		return existing._id;
	}

	const initialBilling = resolveBillingState(
		{
			plan: "free",
			creditsTotal: undefined,
			creditsUsed: undefined,
			periodStart: undefined,
			mcpCallsTotal: undefined,
			mcpCallsThisPeriod: undefined,
			partySeats: undefined,
		},
		now,
	);

	return await ctx.db.insert("users", {
		clerkId: args.clerkId,
		email: args.email,
		imageUrl: args.imageUrl,
		name: args.name,
		createdAt: now,
		updatedAt: now,
		plan: initialBilling.plan,
		creditsTotal: initialBilling.creditsTotal,
		creditsUsed: initialBilling.creditsUsed,
		periodStart: initialBilling.periodStart,
		mcpCallsTotal: initialBilling.mcpCallsTotal,
		mcpCallsThisPeriod: initialBilling.mcpCallsThisPeriod,
		partySeats: initialBilling.partySeats,
	});
}

export async function trackMcpCallHandler(
	ctx: MutationCtx,
	args: TrackMcpCallArgs,
): Promise<string | null> {
	const user = await findUserByClerkId(ctx, args.clerkId);
	if (!user) return null;

	const now = Date.now();
	const billing = resolveBillingState(billingFieldsFromUser(user), now);
	const backfillPatch = buildBillingBackfillPatch(
		billingFieldsFromUser(user),
		now,
	);
	const periodExpired = now > billing.periodStart + THIRTY_DAYS_MS;
	if (!periodExpired && billing.creditsUsed >= billing.creditsTotal) {
		return null;
	}

	if (periodExpired) {
		await ctx.db.patch(user._id, {
			...backfillPatch,
			creditsUsed: 1,
			mcpCallsThisPeriod: 1,
			mcpCallsTotal: billing.mcpCallsTotal + 1,
			periodStart: now,
			creditsTotal: planCreditsFor(billing.plan, billing.partySeats),
		});
	} else {
		await ctx.db.patch(user._id, {
			...backfillPatch,
			creditsUsed: billing.creditsUsed + 1,
			mcpCallsThisPeriod: billing.mcpCallsThisPeriod + 1,
			mcpCallsTotal: billing.mcpCallsTotal + 1,
		});
	}

	return user._id;
}

export async function getUserByClerkIdHandler(ctx: QueryCtx, clerkId: string) {
	const user = await findUserByClerkId(ctx, clerkId);
	if (!user) return null;
	return resolveUserBillingView(user);
}

export async function getUserByStripeCustomerIdHandler(
	ctx: QueryCtx,
	stripeCustomerId: string,
) {
	const user = await findUserByStripeCustomerId(ctx, stripeCustomerId);
	if (!user) return null;
	return resolveUserBillingView(user);
}

export async function setStripeCustomerIdHandler(
	ctx: MutationCtx,
	args: SetStripeCustomerIdArgs,
): Promise<string | null> {
	const user = await findUserByClerkId(ctx, args.clerkId);
	if (!user) return null;

	await ctx.db.patch(user._id, {
		stripeCustomerId: args.stripeCustomerId,
		updatedAt: Date.now(),
	});
	return user._id;
}

export async function applyStripeSubscriptionHandler(
	ctx: MutationCtx,
	args: ApplyStripeSubscriptionArgs,
): Promise<string | null> {
	let user = await findUserByStripeCustomerId(ctx, args.stripeCustomerId);

	if (!user && args.clerkId) {
		user = await findUserByClerkId(ctx, args.clerkId);
	}
	if (!user) return null;

	const existingBilling = resolveBillingState(
		billingFieldsFromUser(user),
		args.now,
	);
	const effectivePlan =
		args.plan ??
		(existingBilling.plan === "party"
			? "party"
			: migrateLegacyPlanTier(user.plan));
	const partySeats =
		effectivePlan === "party"
			? normalizePartySeats(args.partySeats ?? user.partySeats)
			: 1;
	const shouldResetPeriod =
		args.periodStart !== null &&
		(user.periodStart === undefined || args.periodStart > user.periodStart);

	await ctx.db.patch(user._id, {
		stripeCustomerId: args.stripeCustomerId,
		stripeSubscriptionId: args.stripeSubscriptionId ?? undefined,
		stripePriceId: args.stripePriceId ?? undefined,
		subscriptionStatus: args.subscriptionStatus,
		billingInterval: args.billingInterval ?? undefined,
		plan: effectivePlan,
		partySeats,
		creditsTotal: planCreditsFor(effectivePlan, partySeats),
		creditsUsed: shouldResetPeriod ? 0 : existingBilling.creditsUsed,
		mcpCallsThisPeriod: shouldResetPeriod
			? 0
			: existingBilling.mcpCallsThisPeriod,
		periodStart:
			args.periodStart ??
			(shouldResetPeriod ? args.now : existingBilling.periodStart),
		currentPeriodEnd: args.currentPeriodEnd ?? undefined,
		cancelAtPeriodEnd: args.cancelAtPeriodEnd,
		updatedAt: args.now,
	});

	return user._id;
}

export async function downgradeToFreeHandler(
	ctx: MutationCtx,
	args: DowngradeToFreeArgs,
): Promise<string | null> {
	const user = await findUserByStripeCustomerId(ctx, args.stripeCustomerId);
	if (!user) return null;

	const partySeats = 1;
	await ctx.db.patch(user._id, {
		plan: "free",
		partySeats,
		creditsTotal: planCreditsFor("free", partySeats),
		creditsUsed: 0,
		mcpCallsThisPeriod: 0,
		periodStart: args.now,
		stripePriceId: undefined,
		billingInterval: undefined,
		subscriptionStatus: "canceled",
		updatedAt: args.now,
	});
	return user._id;
}

export async function migrateLegacyPlanCatalogHandler(ctx: MutationCtx) {
	const rows = await ctx.db.query("users").collect();
	let updated = 0;

	for (const row of rows) {
		const nextPlan = migrateLegacyPlanTier(row.plan);
		const partySeats =
			nextPlan === "party" ? normalizePartySeats(row.partySeats) : 1;
		const patch = buildBillingBackfillPatch(billingFieldsFromUser(row));
		const shouldPatchPlan = row.plan !== nextPlan;
		const shouldPatchCredits =
			row.creditsTotal === undefined ||
			shouldPatchPlan ||
			row.partySeats === undefined;

		if (
			shouldPatchPlan ||
			shouldPatchCredits ||
			Object.keys(patch).length > 0
		) {
			await ctx.db.patch(row._id, {
				...patch,
				plan: nextPlan,
				partySeats,
				creditsTotal: shouldPatchCredits
					? planCreditsFor(nextPlan, partySeats)
					: row.creditsTotal,
				updatedAt: Date.now(),
			});
			updated += 1;
		}
	}

	return { scanned: rows.length, updated };
}

export async function recordInvoicePaymentHandler(
	ctx: MutationCtx,
	args: RecordInvoicePaymentArgs,
): Promise<"deduplicated" | "inserted"> {
	const existingPayment = await ctx.db
		.query("payments")
		.withIndex("by_stripe_invoice_id", (q) =>
			q.eq("stripeInvoiceId", args.stripeInvoiceId),
		)
		.unique();

	if (!existingPayment) {
		await ctx.db.insert("payments", {
			clerkId: args.clerkId,
			stripeCustomerId: args.stripeCustomerId,
			stripeSubscriptionId: args.stripeSubscriptionId,
			stripeInvoiceId: args.stripeInvoiceId,
			amountPaidCents: args.amountPaidCents,
			currency: args.currency,
			paidAt: args.paidAt,
			status: args.status,
			billingReason: args.billingReason,
			priceId: args.priceId,
			billingInterval: args.billingInterval,
			partySeats: args.partySeats,
			createdAt: args.now,
		});
	}

	const user = await findUserByClerkId(ctx, args.clerkId);
	if (user) {
		await ctx.db.patch(user._id, {
			lastInvoiceId: args.stripeInvoiceId,
			lastPaymentAt: args.paidAt,
			updatedAt: args.now,
		});
	}

	return existingPayment ? "deduplicated" : "inserted";
}

export async function reserveBillingEventHandler(
	ctx: MutationCtx,
	args: ReserveBillingEventArgs,
): Promise<{ accepted: boolean; status: string }> {
	const existing = await ctx.db
		.query("billing_events")
		.withIndex("by_stripe_event_id", (q) =>
			q.eq("stripeEventId", args.stripeEventId),
		)
		.unique();

	if (existing) {
		return {
			accepted: false,
			status: existing.status,
		};
	}

	await ctx.db.insert("billing_events", {
		stripeEventId: args.stripeEventId,
		type: args.type,
		status: "processing",
		createdAt: args.createdAt,
		receivedAt: args.receivedAt,
	});

	return { accepted: true, status: "processing" };
}

export async function completeBillingEventHandler(
	ctx: MutationCtx,
	args: CompleteBillingEventArgs,
): Promise<string | null> {
	const row = await ctx.db
		.query("billing_events")
		.withIndex("by_stripe_event_id", (q) =>
			q.eq("stripeEventId", args.stripeEventId),
		)
		.unique();
	if (!row) return null;

	await ctx.db.patch(row._id, {
		status: args.status,
		error: args.error,
		processedAt: args.processedAt,
	});
	return row._id;
}
