import { timingSafeEqual } from "node:crypto";
import path from "node:path";

/**
 * Creates a validator that checks an Authorization: Bearer <token> header
 * against the configured introspection secret.
 *
 * Used by the /api/auth/introspect-key endpoint to verify that calls
 * come from the trusted MCP server, not arbitrary clients.
 */
export function createIntrospectionSecretValidator(secret: string | undefined) {
	const trimmed = secret?.trim() ?? "";
	const expected = Buffer.from(trimmed);
	function matches(candidate: string | null | undefined): boolean {
		if (!candidate || expected.length === 0) {
			return false;
		}
		const actual = Buffer.from(candidate);
		return (
			actual.length === expected.length && timingSafeEqual(actual, expected)
		);
	}
	return (headers: Headers): boolean => {
		if (!trimmed) {
			return false;
		}
		const customHeader = headers.get("x-bardo-introspection-token")?.trim();
		if (matches(customHeader)) {
			return true;
		}
		const authorization = headers.get("authorization")?.trim();
		return matches(
			authorization?.startsWith("Bearer ")
				? authorization.slice("Bearer ".length).trim()
				: null,
		);
	};
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parseAllowlist(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => path.resolve(entry));
}

export function resolveRequestedWorkspaceRoot(args: {
	rawWorkspaceRoot: unknown;
	allowOverrideEnv?: string | undefined;
	allowlistEnv?: string | undefined;
}): string | null {
	const allowOverride = parseBoolean(args.allowOverrideEnv, false);
	if (!allowOverride) {
		return null;
	}

	if (typeof args.rawWorkspaceRoot !== "string") {
		return null;
	}
	const trimmed = args.rawWorkspaceRoot.trim();
	if (trimmed.length < 2 || trimmed.includes("\0")) {
		return null;
	}
	if (!path.isAbsolute(trimmed)) {
		return null;
	}

	const resolved = path.resolve(trimmed);
	const root = path.parse(resolved).root;
	if (resolved === root) {
		return null;
	}

	const allowlist = parseAllowlist(args.allowlistEnv);
	if (allowlist.length < 1) {
		return null;
	}

	const isAllowed = allowlist.some((prefix) => {
		const relative = path.relative(prefix, resolved);
		return (
			relative === "" ||
			(!relative.startsWith("..") && !path.isAbsolute(relative))
		);
	});

	return isAllowed ? resolved : null;
}
