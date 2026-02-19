import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type AuthContext = {
	apiKey: string | null;
	campaignBasePath: string;
};

export type Session = {
	apiKey: string | null;
	campaignBasePath: string;
	server: McpServer;
	transport: WebStandardStreamableHTTPServerTransport;
};
