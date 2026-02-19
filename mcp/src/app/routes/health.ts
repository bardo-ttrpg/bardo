import { SECURITY_POLICY } from "../../domain/config/security";
import { apiKeyMap } from "../middleware/auth";
import { withCors } from "../middleware/cors";

export function handleHealthRequest(): Response {
	const authRequired =
		SECURITY_POLICY.authMode === "required" || apiKeyMap.size > 0;

	return withCors(
		new Response(
			JSON.stringify({
				status: "ok",
				authRequired,
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
