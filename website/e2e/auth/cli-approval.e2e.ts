import { expect, test } from "@playwright/test";

function json(body: unknown, status = 200) {
	return {
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	};
}

test("CLI approval flow starts a device session and approves it in the browser", async ({
	page,
}) => {
	const sessionId = "cli_session_123";

	await page.route("**/api/billing", async (route) => {
		await route.fulfill(
			json({
				billing: null,
				keyPolicy: {
					maxAllowed: 5,
					dailyUserVerificationLimit: 7500,
					dailyKeyVerificationLimit: 2000,
					mcpPeriodLimit: 25000,
				},
			}),
		);
	});
	await page.route("**/api/keys?*", async (route) => {
		await route.fulfill(
			json({
				keys: [],
				page: {
					hasMore: false,
					nextOffset: null,
				},
			}),
		);
	});
	await page.route("**/api/connect/cli-session/start", async (route) => {
		await route.fulfill(
			json({
				sessionId,
				userCode: "ABCD-EFGH",
				verificationUrl: `http://localhost:3001/dashboard/connect/cli/${sessionId}`,
				pollUrl: `http://localhost:3001/api/connect/cli-session/poll?sessionId=${sessionId}&pollSecret=poll_secret_123`,
				intervalMs: 1000,
				expiresAtISO: new Date(Date.now() + 600_000).toISOString(),
			}),
		);
	});
	await page.route("**/api/connect/cli-session/approve", async (route) => {
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
		const response = await fetch("/api/connect/cli-session/start", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		return (await response.json()) as { sessionId: string };
	});

	expect(session.sessionId).toBe(sessionId);

	await page.goto(`/dashboard/connect/cli/${session.sessionId}`);
	await expect(
		page.getByRole("heading", {
			name: "CLI access approved",
		}),
	).toBeVisible();
	await expect(
		page.getByText(/You can close this tab and return to your terminal\./i),
	).toBeVisible();
});
