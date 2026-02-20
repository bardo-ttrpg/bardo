import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
	contentDirBasePath: "/mpc-docs",
	search: false,
	codeHighlight: true,
	latex: false,
	readingTime: false,
	defaultShowCopyCode: true,
});

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

export default withNextra(nextConfig);
