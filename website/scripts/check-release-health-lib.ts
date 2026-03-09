import { resolveShouldUploadSentryArtifacts } from "../lib/next-config-policy";
import { resolveSentryRelease } from "../lib/sentry-server-config";

type CheckReleaseHealthResult = {
	skipped: boolean;
	errors: string[];
	warnings: string[];
	release: string | undefined;
};

type VerifySentryAuthArgs = {
	authToken: string;
	org: string;
	project: string;
};

type CheckReleaseHealthDeps = {
	verifySentryAuth?: (args: VerifySentryAuthArgs) => Promise<void>;
};

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function isReleaseHealthEnforced(
	env: Record<string, string | undefined>,
): boolean {
	return resolveShouldUploadSentryArtifacts(env);
}

function requireValue(
	value: string | undefined,
	label: string,
	errors: string[],
): string | undefined {
	const normalized = normalize(value);
	if (!normalized) {
		errors.push(`${label} is missing`);
		return undefined;
	}
	return normalized;
}

export async function checkReleaseHealth(
	env: Record<string, string | undefined>,
	deps: CheckReleaseHealthDeps = {},
): Promise<CheckReleaseHealthResult> {
	if (!isReleaseHealthEnforced(env)) {
		return {
			skipped: true,
			errors: [],
			warnings: [],
			release: undefined,
		};
	}

	const errors: string[] = [];
	const warnings: string[] = [];

	requireValue(env.SENTRY_DSN, "SENTRY_DSN", errors);
	requireValue(env.NEXT_PUBLIC_SENTRY_DSN, "NEXT_PUBLIC_SENTRY_DSN", errors);
	requireValue(env.SENTRY_ENVIRONMENT, "SENTRY_ENVIRONMENT", errors);
	requireValue(
		env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
		"NEXT_PUBLIC_SENTRY_ENVIRONMENT",
		errors,
	);

	const release = resolveSentryRelease(env);
	if (!release) {
		errors.push("SENTRY_RELEASE is missing");
	}

	const org = requireValue(env.SENTRY_ORG, "SENTRY_ORG", errors);
	const project = requireValue(env.SENTRY_PROJECT, "SENTRY_PROJECT", errors);
	const authToken = requireValue(
		env.SENTRY_AUTH_TOKEN,
		"SENTRY_AUTH_TOKEN",
		errors,
	);

	if (
		errors.length === 0 &&
		deps.verifySentryAuth &&
		authToken &&
		org &&
		project
	) {
		try {
			await deps.verifySentryAuth({
				authToken,
				org,
				project,
			});
		} catch (error) {
			errors.push(
				`Sentry auth verification failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	return {
		skipped: false,
		errors,
		warnings,
		release,
	};
}
