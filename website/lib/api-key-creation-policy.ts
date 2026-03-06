import { maxApiKeysForPlan } from "./api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "./clerk-live-billing";

type BillingCapableClerk = Parameters<
	typeof fetchLiveBillingSnapshotFromClerk
>[0];

type ClerkForApiKeyCreationPolicy = BillingCapableClerk & {
	apiKeys: {
		list: (args: { subject: string; limit: number }) => Promise<{
			totalCount: number;
		}>;
	};
};

type AssertApiKeyCreationAllowedOptions = {
	clerk: ClerkForApiKeyCreationPolicy;
	userId: string;
	fetchLiveBilling?: typeof fetchLiveBillingSnapshotFromClerk;
};

export class ApiKeyCreationPolicyError extends Error {
	status: 403 | 503;

	constructor(status: 403 | 503, message: string) {
		super(message);
		this.name = "ApiKeyCreationPolicyError";
		this.status = status;
	}
}

export async function assertApiKeyCreationAllowed(
	options: AssertApiKeyCreationAllowedOptions,
) {
	const fetchLiveBilling =
		options.fetchLiveBilling ?? fetchLiveBillingSnapshotFromClerk;
	const liveBilling = await fetchLiveBilling(options.clerk, options.userId);
	if (liveBilling.billingUnavailable) {
		throw new ApiKeyCreationPolicyError(
			503,
			"Billing service unavailable, please try again",
		);
	}

	const maxAllowed = maxApiKeysForPlan(liveBilling.plan);
	const probe = await options.clerk.apiKeys.list({
		subject: options.userId,
		limit: 1,
	});
	if (probe.totalCount >= maxAllowed) {
		throw new ApiKeyCreationPolicyError(
			403,
			"API key limit reached for your plan",
		);
	}
}
