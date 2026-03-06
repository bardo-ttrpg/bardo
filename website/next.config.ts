import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import {
	resolveAllowedDevOrigins,
	resolveSecurityHeaders,
	resolveSentryBuildSilence,
} from "./lib/next-config-policy";
import { resolveSentryRelease } from "./lib/sentry-server-config";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	transpilePackages: ["@bardo/mcp"],
	allowedDevOrigins: resolveAllowedDevOrigins(process.env),
	images: {
		formats: ["image/avif", "image/webp"],
		remotePatterns: [
			{
				protocol: "https",
				hostname: "img.youtube.com",
			},
		],
	},
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: resolveSecurityHeaders(process.env),
			},
		];
	},
};

const sentryRelease = resolveSentryRelease(process.env);

export default withSentryConfig(nextConfig, {
	silent: resolveSentryBuildSilence(process.env),
	authToken: process.env.SENTRY_AUTH_TOKEN,
	project: process.env.SENTRY_PROJECT,
	release: sentryRelease ? { name: sentryRelease } : undefined,
});
