import type { NextConfig } from "next";

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

export default nextConfig;
