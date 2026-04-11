export type LegalSection = {
	id: string;
	title: string;
};

export type LegalEntry = {
	slug: string;
	href: string;
	title: string;
	navigationLabel: string;
	eyebrow: string;
	description: string;
	summary: string;
	effectiveDate: string;
	lastUpdated: string;
	sections: readonly LegalSection[];
};

const LEGAL_EFFECTIVE_DATE = "April 3, 2026";

const legalEntries = [
	{
		slug: "terms",
		href: "/legal/terms",
		title: "Terms of Service",
		navigationLabel: "Terms",
		eyebrow: "Legal / Terms",
		description:
			"Terms that govern access to the Bardo website, dashboard, billing surface, and bridge approval workflows.",
		summary:
			"These terms cover the public website, account access, and hosted workflows around approvals, billing, and service operations.",
		effectiveDate: LEGAL_EFFECTIVE_DATE,
		lastUpdated: LEGAL_EFFECTIVE_DATE,
		sections: [
			{ id: "scope", title: "Scope of the service" },
			{ id: "accounts-and-access", title: "Accounts and access" },
			{ id: "acceptable-use", title: "Acceptable use" },
			{ id: "changes-and-availability", title: "Changes and availability" },
		],
	},
	{
		slug: "privacy",
		href: "/legal/privacy",
		title: "Privacy Policy",
		navigationLabel: "Privacy",
		eyebrow: "Legal / Privacy",
		description:
			"Privacy summary for the Bardo website, account access, billing state, and bridge approval requests.",
		summary:
			"This page describes what Bardo collects to operate the hosted account layer and what stays outside that hosted surface.",
		effectiveDate: LEGAL_EFFECTIVE_DATE,
		lastUpdated: LEGAL_EFFECTIVE_DATE,
		sections: [
			{ id: "what-bardo-collects", title: "What Bardo collects" },
			{ id: "how-bardo-uses-data", title: "How Bardo uses data" },
			{ id: "what-stays-local", title: "What stays local" },
			{ id: "retention-and-requests", title: "Retention and requests" },
		],
	},
	{
		slug: "data-use",
		href: "/legal/data-use",
		title: "Data Use",
		navigationLabel: "Data Use",
		eyebrow: "Legal / Data Use",
		description:
			"Product data-boundary summary for local files, hosted account services, and third-party AI clients.",
		summary:
			"This page explains the practical split between local campaign data, the Bardo hosted layer, and the external clients or models you choose to use.",
		effectiveDate: LEGAL_EFFECTIVE_DATE,
		lastUpdated: LEGAL_EFFECTIVE_DATE,
		sections: [
			{ id: "local-files", title: "Local files and workspace context" },
			{ id: "hosted-service-data", title: "Hosted service data" },
			{ id: "third-party-clients", title: "Third-party clients and models" },
			{ id: "policy-boundary", title: "Policy boundary" },
		],
	},
	{
		slug: "security",
		href: "/legal/security",
		title: "Security",
		navigationLabel: "Security",
		eyebrow: "Legal / Security",
		description:
			"Security overview for Bardo's local-first product boundary, hosted approvals, and public website surface.",
		summary:
			"This page explains the security model at a high level without claiming audits, certifications, or guarantees Bardo does not publicly offer.",
		effectiveDate: LEGAL_EFFECTIVE_DATE,
		lastUpdated: LEGAL_EFFECTIVE_DATE,
		sections: [
			{ id: "design-boundary", title: "Security by design boundary" },
			{ id: "hosted-surface", title: "Hosted surface" },
			{ id: "user-responsibilities", title: "User responsibilities" },
			{ id: "security-questions", title: "Security questions" },
		],
	},
] as const satisfies readonly LegalEntry[];

export function listLegalEntries() {
	return legalEntries;
}

export function getLegalEntryBySlug(slug: string) {
	return legalEntries.find((entry) => entry.slug === slug) ?? null;
}
