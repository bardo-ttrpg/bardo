import { apiKeyMap } from "./src/app/middleware/auth";
import { createHttpServer } from "./src/app/server";
import { PORT } from "./src/domain/config/constants";

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
