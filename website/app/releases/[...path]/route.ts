import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

export const runtime = "nodejs";

function convexUrl(): string | null {
	return process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || null;
}

export async function GET(
	_: Request,
	context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	const url = convexUrl();
	if (!url) {
		return new Response("Convex release storage is not configured.", {
			status: 503,
		});
	}

	const params = await context.params;
	const releasePath = `releases/${params.path.join("/")}`;
	const client = new ConvexHttpClient(url);
	const file = await client.query(api.releaseFiles.getReleaseFile, {
		path: releasePath,
	});

	if (!file?.url) {
		return new Response("Release asset not found.", {
			status: 404,
			headers: {
				"cache-control": "public, max-age=60, s-maxage=60",
			},
		});
	}

	return Response.redirect(file.url, 307);
}
