export const BARDO_MCP_PACKAGE_VERSION = "0.1.1";

export const BARDO_MCP_PUBLIC_RELEASES_BASE_URL =
	"https://9tg7sti5kqltyrat.public.blob.vercel-storage.com/releases";

export const BARDO_MCP_RELEASE_VERSION = BARDO_MCP_PACKAGE_VERSION.startsWith(
	"v",
)
	? BARDO_MCP_PACKAGE_VERSION
	: `v${BARDO_MCP_PACKAGE_VERSION}`;
