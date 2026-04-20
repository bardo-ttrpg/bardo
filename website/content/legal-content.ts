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
			"Terms for using the Bardo SaaS, account system, billing, bridge approvals, and related website features.",
		summary:
			"These terms cover the hosted Bardo service, payment terms, user responsibility, and the limits of Bard Studio's responsibility.",
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
			"Privacy summary for Bardo account data, subscription handling, session state, and the local-first product boundary.",
		summary:
			"This page explains the small set of hosted data Bardo uses, what stays local, and that Bardo does not sell user data.",
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
			"Data-boundary summary for local campaign files, hosted account services, and third-party AI clients or models.",
		summary:
			"This page explains the practical split between local campaign truth, hosted account data, and any external tools you choose to connect.",
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
			"Security overview for Bardo's local-first boundary, hosted account surface, and shared-responsibility model.",
		summary:
			"This page explains Bardo's security model at a high level without promising certifications, audits, or guarantees that are not publicly offered.",
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
