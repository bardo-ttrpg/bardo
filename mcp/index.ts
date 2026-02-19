import { apiKeyMap } from "./src/app/middleware/auth";
import { createHttpServer } from "./src/app/server";
import { PORT } from "./src/domain/config/constants";
import { SECURITY_POLICY } from "./src/domain/config/security";

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
});

const server = createHttpServer({ port: PORT });

console.log(
	`MCP server listening at ${new URL("/mcp", server.url).toString()}`,
);
console.log(
	apiKeyMap.size > 0
		? `API key auth enabled (${apiKeyMap.size} key(s) configured)`
		: "API key auth disabled (BARDO_API_KEYS_JSON not configured or invalid)",
);
console.log(
	`Security policy: authMode=${SECURITY_POLICY.authMode}, allowQueryApiKey=${SECURITY_POLICY.allowQueryApiKey}, sessionTtlMs=${SECURITY_POLICY.sessionTtlMs}, maxRequestBytes=${SECURITY_POLICY.maxRequestBytes}`,
);
