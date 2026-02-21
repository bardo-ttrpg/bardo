import { renderPrometheusMetrics } from "../../telemetry";
import { withCors } from "../middleware/cors";

export function handleMetricsRequest(): Response {
	return withCors(
		new Response(renderPrometheusMetrics(), {
			status: 200,
			headers: {
				"cache-control": "no-store",
				"content-type": "text/plain; version=0.0.4; charset=utf-8",
			},
		}),
	);
}
