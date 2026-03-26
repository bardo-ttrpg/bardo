import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type AuthContext = {
	apiKey: string | null;
	campaignBasePath: string;
	subjectId?: string | null;
	keyId?: string | null;
	plan?: "free" | "solo" | null;
	mcpPeriodLimit?: number | null;
};

export type Session = {
	apiKey: string | null;
	campaignBasePath: string;
	subjectId?: string | null;
	keyId?: string | null;
	plan?: "free" | "solo" | null;
	mcpPeriodLimit?: number | null;
	server: McpServer;
	transport: WebStandardStreamableHTTPServerTransport;
};
