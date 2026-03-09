import "./load-next-env";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateE2EAuthEnv } from "../scripts/validate-e2e-auth-env-lib";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const authStorageStatePath = resolve(
	currentDir,
	"..",
	".playwright",
	"auth",
	"user.json",
);

export function ensureAuthStorageDir() {
	mkdirSync(dirname(authStorageStatePath), { recursive: true });
}

type ClerkE2ECredentials = ReturnType<typeof getClerkE2ECredentials>;

function getClerkApiBaseUrl() {
	const configured = process.env.CLERK_API_URL?.trim();
	if (!configured) {
		return "https://api.clerk.com/v1";
	}

	return configured.endsWith("/v1")
		? configured.replace(/\/+$/u, "")
		: `${configured.replace(/\/+$/u, "")}/v1`;
}

function getSecretKey() {
	const secretKey = process.env.CLERK_SECRET_KEY?.trim();
	if (!secretKey) {
		throw new Error(
			"CLERK_SECRET_KEY is required to seed Clerk E2E users in development.",
		);
	}

	return secretKey;
}

function userMatchesIdentity(
	user: Record<string, unknown>,
	credentials: ClerkE2ECredentials,
) {
	const emailAddresses = (
		Array.isArray(user.email_addresses)
			? user.email_addresses
			: Array.isArray(user.emailAddresses)
				? user.emailAddresses
				: []
	) as Array<Record<string, unknown>>;
	const phoneNumbers = (
		Array.isArray(user.phone_numbers)
			? user.phone_numbers
			: Array.isArray(user.phoneNumbers)
				? user.phoneNumbers
				: []
	) as Array<Record<string, unknown>>;

	const matchesEmail = credentials.email
		? emailAddresses.some((entry) => {
				const value =
					typeof entry.email_address === "string"
						? entry.email_address
						: typeof entry.emailAddress === "string"
							? entry.emailAddress
							: null;
				return value === credentials.email;
			})
		: false;

	const matchesPhone = credentials.phoneNumber
		? phoneNumbers.some((entry) => {
				const value =
					typeof entry.phone_number === "string"
						? entry.phone_number
						: typeof entry.phoneNumber === "string"
							? entry.phoneNumber
							: null;
				return value === credentials.phoneNumber;
			})
		: false;

	return matchesEmail || matchesPhone;
}

async function clerkApiFetch(path: string, init?: RequestInit) {
	const response = await fetch(`${getClerkApiBaseUrl()}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${getSecretKey()}`,
			"content-type": "application/json",
			...(init?.headers ?? {}),
		},
	});

	if (response.ok) {
		return response;
	}

	const body = await response.text();
	throw new Error(
		`Clerk Backend API ${response.status} for ${path}: ${body || response.statusText}`,
	);
}

export async function ensureClerkTestUserExists() {
	const credentials = getClerkE2ECredentials();
	const identityQuery = credentials.email ?? credentials.phoneNumber;
	if (!identityQuery) {
		return credentials;
	}

	const listResponse = await clerkApiFetch(
		`/users?limit=10&query=${encodeURIComponent(identityQuery)}`,
		{ method: "GET", headers: { "content-type": "application/json" } },
	);
	const listPayload = (await listResponse.json()) as { data?: unknown[] };
	const existingUser = listPayload.data?.find((user) =>
		userMatchesIdentity(user as Record<string, unknown>, credentials),
	);

	if (existingUser) {
		return credentials;
	}

	const body: Record<string, unknown> = {
		first_name: "Bardo",
		last_name: "E2E",
		legal_accepted_at: new Date().toISOString(),
	};

	if (credentials.strategy === "phone_code" && credentials.phoneNumber) {
		body.phone_number = [credentials.phoneNumber];
	} else if (credentials.email) {
		body.email_address = [credentials.email];
	}

	if (credentials.password) {
		body.password = credentials.password;
	} else {
		body.skip_password_requirement = true;
	}

	try {
		await clerkApiFetch("/users", {
			method: "POST",
			body: JSON.stringify(body),
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("form_identifier_exists")
		) {
			return credentials;
		}
		throw error;
	}

	return credentials;
}

export function getClerkE2ECredentials() {
	const result = validateE2EAuthEnv(process.env);
	if (result.errors.length > 0 || !result.strategy) {
		throw new Error(
			[
				"Invalid Clerk Playwright auth env.",
				...result.errors,
				...result.warnings,
			].join(" "),
		);
	}

	return {
		email: result.email,
		password: result.password,
		phoneNumber: result.phoneNumber,
		strategy: result.strategy,
		verificationCode: result.verificationCode ?? "424242",
		warnings: result.warnings,
	};
}
