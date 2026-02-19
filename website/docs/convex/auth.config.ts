import type { AuthConfig } from "convex/server";

const clerkIssuerDomain =
	process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://clerk.invalid";

export default {
	providers: [
		{
			domain: clerkIssuerDomain,
			applicationID: "convex",
		},
	],
} satisfies AuthConfig;
