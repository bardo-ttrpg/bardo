import { renderPowerShellInstallScript } from "@/lib/install-script";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
	return new Response(renderPowerShellInstallScript(), {
		status: 200,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=300, s-maxage=300",
		},
	});
}
