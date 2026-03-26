import { expect, test } from "@playwright/test";

function json(body: unknown, status = 200) {
	return {
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	};
}

test("bridge approval flow starts a device session and approves it in the browser", async ({
	page,
}) => {
	const sessionId = "cli_session_123";

	await page.route("**/api/billing", async (route) => {
		await route.fulfill(
			json({
				billing: null,
				accessPolicy: {
					subscribed: true,
					mcpPeriodLimit: 25000,
				},
			}),
		);
	});
	await page.route("**/api/connect/bridge-session/start", async (route) => {
		await route.fulfill(
			json({
				sessionId,
				userCode: "ABCD-EFGH",
				verificationUrl: `http://localhost:3001/dashboard/connect/bridge/${sessionId}`,
				pollUrl: `http://localhost:3001/api/connect/bridge-session/poll?sessionId=${sessionId}&pollSecret=poll_secret_123`,
				intervalMs: 1000,
				expiresAtISO: new Date(Date.now() + 600_000).toISOString(),
			}),
		);
	});
	await page.route("**/api/connect/bridge-session/approve", async (route) => {
		const requestBody = route.request().postDataJSON() as {
			sessionId?: string;
		};
		await route.fulfill(
			requestBody.sessionId === sessionId
				? json({ ok: true })
				: json({ error: "Unexpected session." }, 400),
		);
	});

	await page.goto("/dashboard");

	const session = await page.evaluate(async () => {
		const response = await fetch("/api/connect/bridge-session/start", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		return (await response.json()) as { sessionId: string };
	});

	expect(session.sessionId).toBe(sessionId);

	await page.goto(`/dashboard/connect/bridge/${session.sessionId}`);
	await expect(
		page.getByRole("heading", {
			name: "Bridge access approved",
		}),
	).toBeVisible();
	await expect(
		page.getByText(/You can close this tab and return to your AI client\./i),
	).toBeVisible();
});
