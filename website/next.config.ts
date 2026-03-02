import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import {
	resolveSentryOrgSlug,
	resolveSentryRelease,
} from "./lib/sentry-server-config";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	allowedDevOrigins: [
		"127.0.0.1",
		"localhost",
		"::1",
		"[::1]",
		"*.ngrok-free.app",
		"*.ngrok.io",
	],
	images: {
		formats: ["image/avif", "image/webp"],
		remotePatterns: [
			{
				protocol: "https",
				hostname: "img.youtube.com",
			},
		],
	},
};

const sentryRelease = resolveSentryRelease(process.env);
const sentryOrg = resolveSentryOrgSlug(process.env);

export default withSentryConfig(nextConfig, {
	silent: true,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	org: sentryOrg,
	project: process.env.SENTRY_PROJECT,
	release: sentryRelease ? { name: sentryRelease } : undefined,
});
