import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	allowedDevOrigins: ["127.0.0.1", "localhost"],
	images: {
		formats: ["image/avif", "image/webp"],
		remotePatterns: [
			{
				protocol: "https",
				hostname: "startup-template-sage.vercel.app",
			},
		],
	},
};

export default nextConfig;
