import { apiKeyMap } from "../middleware/auth";
import { withCors } from "../middleware/cors";

export function handleHealthRequest(): Response {
	return withCors(
		new Response(
			JSON.stringify({
				status: "ok",
				authRequired: apiKeyMap.size > 0,
				configuredApiKeys: apiKeyMap.size,
			}),
			{
				headers: {
					"content-type": "application/json",
				},
			},
		),
	);
}
