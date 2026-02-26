// Clerk session token custom claims type declarations.
// Extend this interface to match any custom claims configured in
// Clerk Dashboard → Sessions → Edit default session token.
// See: https://clerk.com/docs/guides/sessions/customize-session-tokens
export {};

declare global {
	interface CustomJwtSessionClaims {
		// Example: metadata?: { plan?: string; role?: string };
	}
}
