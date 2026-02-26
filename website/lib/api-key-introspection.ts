/**
 * Creates a validator that checks an Authorization: Bearer <token> header
 * against the configured introspection secret.
 *
 * Used by the /api/auth/introspect-key endpoint to verify that calls
 * come from the trusted MCP server, not arbitrary clients.
 */
export function createIntrospectionSecretValidator(secret: string | undefined) {
	const trimmed = secret?.trim() ?? "";
	return (headers: Headers): boolean => {
		if (!trimmed) {
			return false;
		}
		const authorization = headers.get("authorization")?.trim();
		return authorization === `Bearer ${trimmed}`;
	};
}
