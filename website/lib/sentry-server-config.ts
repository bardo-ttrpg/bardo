import { execFileSync } from "node:child_process";
import {
	defaultSampleRate,
	normalizeString,
	parseSampleRate,
} from "./sentry-shared";

type ServerSentryEnv = Partial<
	Record<
		| "NODE_ENV"
		| "SENTRY_DSN"
		| "SENTRY_AUTH_TOKEN"
		| "SENTRY_ENVIRONMENT"
		| "SENTRY_ORG"
		| "SENTRY_RELEASE"
		| "SENTRY_TRACES_SAMPLE_RATE"
		| "VERCEL_GIT_COMMIT_SHA"
		| "RAILWAY_GIT_COMMIT_SHA"
		| "GITHUB_SHA"
		| "SOURCE_VERSION"
		| "COMMIT_SHA",
		string | undefined
	>
>;

type AccessibleSentryOrganization = {
	slug?: string | null;
	name?: string | null;
};

type ListAccessibleOrganizations = (
	token: string,
) => AccessibleSentryOrganization[];

export function resolveSentryRelease(
	env: ServerSentryEnv = process.env,
): string | undefined {
	return (
		normalizeString(env.SENTRY_RELEASE) ??
		normalizeString(env.VERCEL_GIT_COMMIT_SHA) ??
		normalizeString(env.RAILWAY_GIT_COMMIT_SHA) ??
		normalizeString(env.GITHUB_SHA) ??
		normalizeString(env.SOURCE_VERSION) ??
		normalizeString(env.COMMIT_SHA)
	);
}

function normalizeOrgIdentifier(
	value: string | null | undefined,
): string | null {
	const normalized = normalizeString(value ?? undefined)?.toLowerCase();
	return normalized ? normalized.replace(/[^a-z0-9]+/g, "-") : null;
}

function listAccessibleSentryOrganizations(
	token: string,
): AccessibleSentryOrganization[] {
	const stdout = execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			[
				"const response = await fetch('https://us.sentry.io/api/0/organizations/', {",
				"  headers: { Authorization: 'Bearer ' + process.env.SENTRY_AUTH_TOKEN },",
				"});",
				"if (!response.ok) {",
				"  throw new Error('Sentry organization lookup failed: ' + response.status);",
				"}",
				"const organizations = await response.json();",
				"process.stdout.write(JSON.stringify(organizations));",
			].join("\n"),
		],
		{
			env: {
				...process.env,
				SENTRY_AUTH_TOKEN: token,
			},
			stdio: ["ignore", "pipe", "ignore"],
		},
	);

	const parsed = JSON.parse(stdout.toString()) as unknown;
	return Array.isArray(parsed)
		? (parsed as AccessibleSentryOrganization[])
		: [];
}

export function resolveSentryOrgSlug(
	env: ServerSentryEnv = process.env,
	listOrganizations: ListAccessibleOrganizations = listAccessibleSentryOrganizations,
): string | undefined {
	const configuredOrg = normalizeString(env.SENTRY_ORG);
	if (!configuredOrg) return undefined;

	const token = normalizeString(env.SENTRY_AUTH_TOKEN);
	if (!token) return configuredOrg;

	try {
		const organizations = listOrganizations(token);
		const configuredSlug = normalizeOrgIdentifier(configuredOrg);

		const slugMatch = organizations.find((organization) => {
			return normalizeOrgIdentifier(organization.slug) === configuredSlug;
		});
		if (slugMatch?.slug) {
			return slugMatch.slug;
		}

		const nameMatch = organizations.find((organization) => {
			return normalizeOrgIdentifier(organization.name) === configuredSlug;
		});
		return normalizeString(nameMatch?.slug ?? undefined) ?? configuredOrg;
	} catch {
		return configuredOrg;
	}
}

export function createServerSentryOptions(env: ServerSentryEnv = process.env) {
	return {
		dsn: normalizeString(env.SENTRY_DSN),
		enabled: Boolean(normalizeString(env.SENTRY_DSN)),
		environment: normalizeString(env.SENTRY_ENVIRONMENT) ?? env.NODE_ENV,
		release: resolveSentryRelease(env),
		tracesSampleRate: parseSampleRate(
			env.SENTRY_TRACES_SAMPLE_RATE,
			defaultSampleRate(env.NODE_ENV),
		),
		enableLogs: true,
		sendDefaultPii: false,
	};
}
