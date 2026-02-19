import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
	path: "/track-mcp",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const body = await request.json();
		const { clerkId } = body as { clerkId: string };

		if (!clerkId) {
			return new Response(JSON.stringify({ error: "clerkId required" }), {
				status: 400,
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
