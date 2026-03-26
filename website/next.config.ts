import type { NextConfig } from "next";
import {
	resolveAllowedDevOrigins,
	resolveSecurityHeaders,
} from "./lib/next-config-policy";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	transpilePackages: ["@bardo/mcp"],
	experimental: {
		turbopackFileSystemCacheForBuild: true,
		turbopackFileSystemCacheForDev: true,
	},
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

export default nextConfig;
