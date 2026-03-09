import createBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import {
	resolveAllowedDevOrigins,
	resolveSecurityHeaders,
	resolveSentryBuildSilence,
	resolveShouldUploadSentryArtifacts,
} from "./lib/next-config-policy";
import { resolveSentryRelease } from "./lib/sentry-server-config";

const withBundleAnalyzer = createBundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

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
				pathname: "/vi/**",
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
const shouldUploadSentryArtifacts = resolveShouldUploadSentryArtifacts(
	process.env,
);

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
	silent: resolveSentryBuildSilence(process.env),
	authToken: shouldUploadSentryArtifacts
		? process.env.SENTRY_AUTH_TOKEN
		: undefined,
	org: shouldUploadSentryArtifacts ? process.env.SENTRY_ORG : undefined,
	project: shouldUploadSentryArtifacts ? process.env.SENTRY_PROJECT : undefined,
	release:
		shouldUploadSentryArtifacts && sentryRelease
			? { name: sentryRelease }
			: undefined,
	sourcemaps: {
		disable: !shouldUploadSentryArtifacts,
	},
});
