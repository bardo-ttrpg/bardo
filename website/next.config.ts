import nextMDX from "@next/mdx";
import type { NextConfig } from "next";
import {
	resolveAllowedDevOrigins,
	resolveSecurityHeaders,
} from "./lib/next-config-policy";

const withMDX = nextMDX({
	extension: /\.mdx?$/,
	options: {
		remarkPlugins: ["remark-gfm"],
	},
});

const nextConfig: NextConfig = {
	reactStrictMode: true,
	transpilePackages: ["@bardo/shared"],
	experimental: {
		turbopackFileSystemCacheForBuild: true,
		turbopackFileSystemCacheForDev: true,
		viewTransition: true,
	},
	allowedDevOrigins: resolveAllowedDevOrigins(process.env),
	images: {
		formats: ["image/avif", "image/webp"],
		qualities: [100, 75, 82],
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

export default withMDX(nextConfig);
