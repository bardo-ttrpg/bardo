import { BARDO_MCP_PUBLIC_GITHUB_RELEASES_BASE_URL } from "@/lib/bardo-mcp-release";

export const runtime = "nodejs";

export async function GET(
	_: Request,
	context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	const params = await context.params;
	const [version, ...assetParts] = params.path;
	const assetName = assetParts.join("/");
	if (!version || !assetName || assetName.includes("..")) {
		return new Response("Release asset not found.", {
			status: 404,
			headers: {
				"cache-control": "public, max-age=60, s-maxage=60",
			},
		});
	}

	return Response.redirect(
		`${BARDO_MCP_PUBLIC_GITHUB_RELEASES_BASE_URL}/${encodeURIComponent(version)}/${assetName
			.split("/")
			.map((part) => encodeURIComponent(part))
			.join("/")}`,
		307,
	);
}
