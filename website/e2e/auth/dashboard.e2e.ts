import { expect, test } from "@playwright/test";

type DashboardKey = {
	id: string;
	name: string;
	status: string;
	scopes: string[];
	createdAt: number;
	workspacePath: string | null;
	callsTotal: number;
	callsThisPeriod: number;
	lastUsedAt: number | null;
	lastUsedProviderId: string | null;
	lastUsedModelId: string | null;
};

function json(body: unknown, status = 200) {
	return {
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	};
}

test("dashboard covers billing, key lifecycle, pagination, snippets, and CLI login", async ({
	page,
}) => {
	let activeKeys: DashboardKey[] = [
		{
			id: "key_primary",
			name: "Default key",
			status: "active",
			scopes: ["mcp"],
			createdAt: Date.now(),
			workspacePath: "./customers/user_123",
			callsTotal: 120,
			callsThisPeriod: 12,
			lastUsedAt: Date.now(),
			lastUsedProviderId: "openai",
			lastUsedModelId: "gpt-5",
		},
	];
	const paginatedKeys: DashboardKey[] = [
		{
			id: "key_archived",
			name: "Archived key",
			status: "revoked",
			scopes: ["mcp"],
			createdAt: Date.now() - 60_000,
			workspacePath: "./customers/user_123",
			callsTotal: 45,
			callsThisPeriod: 0,
			lastUsedAt: null,
			lastUsedProviderId: null,
			lastUsedModelId: null,
		},
	];
	let createCount = 0;

	await page.route("**/api/billing", async (route) => {
		await route.fulfill(
			json({
				billing: {
					plan: "solo",
					creditsTotal: 1000,
					creditsUsed: 25,
					periodStart: Date.now() - 86_400_000,
					mcpCallsTotal: 120,
					mcpCallsThisPeriod: 12,
				},
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
		const requestUrl = new URL(route.request().url());
		const offset = requestUrl.searchParams.get("offset");
		if (offset === "1") {
			await route.fulfill(
				json({
					keys: paginatedKeys,
					page: {
						hasMore: false,
						nextOffset: null,
					},
				}),
			);
			return;
		}

		await route.fulfill(
			json({
				keys: activeKeys,
				page: {
					hasMore: true,
					nextOffset: 1,
				},
			}),
		);
	});

	await page.route("**/api/keys", async (route) => {
		createCount += 1;
		const requestBody = route.request().postDataJSON() as {
			name?: string;
		};
		const keyName = requestBody.name?.trim() || "Default key";
		const secret =
			createCount === 1 ? "secret-created-123" : "secret-rotated-456";
		const key: DashboardKey = {
			id: createCount === 1 ? "key_created" : "key_rotated",
			name: keyName,
			status: "active",
			scopes: ["mcp"],
			createdAt: Date.now(),
			workspacePath: "./customers/user_123",
			callsTotal: 0,
			callsThisPeriod: 0,
			lastUsedAt: null,
			lastUsedProviderId: null,
			lastUsedModelId: null,
		};
		activeKeys = [key];
		await route.fulfill(
			json({
				key,
				secret,
			}),
		);
	});

	await page.route("**/api/keys/*", async (route) => {
		const keyId = route.request().url().split("/").at(-1);
		activeKeys = activeKeys.filter((key) => key.id !== keyId);
		await route.fulfill(json({ revoked: true }));
	});

	await page.route("**/api/connect/snippets", async (route) => {
		const requestBody = route.request().postDataJSON() as {
			apiKey?: string;
			client?: string;
		};
		await route.fulfill(
			json({
				baseUrl: "http://127.0.0.1:3000/mcp",
				snippet: `client=${requestBody.client}\napiKey=${requestBody.apiKey}`,
			}),
		);
	});

	await page.route("**/api/connect/cli-token", async (route) => {
		await route.fulfill(
			json({
				loginToken: "cli-login-token",
				exchangeUrl: "https://app.bardo.ai/api/connect/cli-exchange",
			}),
		);
	});

	await page.goto("/dashboard");

	const exactSecretBlock = (secret: string) =>
		page.locator("pre").filter({ hasText: new RegExp(`^${secret}$`) });

	await expect(
		page.getByRole("heading", {
			name: "Dashboard",
		}),
	).toBeVisible();
	await expect(page.getByText(/Plan: solo/i)).toBeVisible();
	await expect(page.getByText(/Active keys: 1 \/ 5/i)).toBeVisible();

	await page.getByRole("button", { name: "Create key" }).click();
	await expect(page.getByText(/Created Default key\./i)).toBeVisible();
	await expect(exactSecretBlock("secret-created-123")).toBeVisible();

	await page.getByRole("button", { name: "Generate snippet" }).click();
	await expect(page.getByText(/client=codex/i)).toBeVisible();
	await expect(page.getByText(/apiKey=secret-created-123/i)).toBeVisible();

	await page.getByRole("button", { name: "Generate CLI Login" }).click();
	await expect(
		page.getByText(/bardo login --token "cli-login-token"/i),
	).toBeVisible();

	await page.getByRole("button", { name: "Load more keys" }).click();
	await expect(page.getByText("Archived key")).toBeVisible();

	await page.getByRole("button", { name: "Rotate" }).first().click();
	await expect(page.getByText(/Rotated Default key\./i)).toBeVisible();
	await expect(exactSecretBlock("secret-rotated-456")).toBeVisible();

	await page.getByRole("button", { name: "Delete" }).first().click();
	await expect(
		page.getByText(/No keys yet\. Create your first API key above\./i),
	).toBeVisible();
});
