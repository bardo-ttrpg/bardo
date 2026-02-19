import { httpRouter } from "convex/server";
import { clerkIdFromIdentity } from "../lib/convex-auth";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
	path: "/track-mcp",
	method: "POST",
	handler: httpAction(async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		const clerkId = clerkIdFromIdentity(identity);

		if (!clerkId) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		const result = await ctx.runMutation(api.users.trackMcpCall, { clerkId });

		return new Response(JSON.stringify({ ok: true, userId: result }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}),
});

export default http;
