import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
	contentDirBasePath: "/mpc-docs",
	search: false,
	codeHighlight: false,
	latex: false,
	readingTime: false,
	defaultShowCopyCode: false,
});

const nextConfig: NextConfig = {
	reactStrictMode: true,
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
