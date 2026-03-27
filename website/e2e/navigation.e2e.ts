import { expect, test } from "@playwright/test";

test("primary navigation opens docs, pricing, and legal pages", async ({
	page,
}) => {
	await page.goto("/");

	const primaryNav = page.getByRole("navigation", { name: "Primary" });
	const docsLink = primaryNav.getByRole("link", { name: "Docs" });
	const pricingLink = primaryNav.getByRole("link", { name: "Pricing" });
	await expect(primaryNav.getByRole("link", { name: "Codex" })).toHaveCount(0);

	await page.goto("/");
	await expect(docsLink).toHaveAttribute("href", "/docs");
	await page.goto("/docs");
	await expect(page).toHaveURL(/\/docs$/);
	await expect(
		page
			.getByRole("heading", {
				name: /^Getting Started$/i,
			})
			.first(),
	).toBeVisible();

	await page.goto("/");
	await expect(pricingLink).toHaveAttribute("href", "/pricing");
	await page.goto("/pricing");
	await expect(page).toHaveURL(/\/pricing$/);
	await expect(
		page.getByRole("heading", {
			name: /One plan for the full Bardo control surface/i,
		}),
	).toBeVisible();
});

test("hero install surface shows a single curl command", async ({ page }) => {
	await page.goto("/");
	const installSurface = page.getByLabel("Install command");
	await expect(installSurface).toBeVisible();
	await expect(installSurface).toContainText(
		"curl -fsSL https://bardo.gg/install | sh",
	);
	await expect(installSurface).not.toContainText("npm");
	await expect(installSurface).not.toContainText(
		"bardo connect --client codex",
	);
});

test("theme toggle is available on the public shell", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "Dark", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Light", exact: true }),
	).toBeVisible();
});

test("legal index links to terms policy page", async ({ page }) => {
	await page.goto("/legal");
	const termsLink = page.getByRole("link", { name: /Terms of Service/i });
	await expect(termsLink).toHaveAttribute("href", "/legal/terms");
	await page.goto("/legal/terms");
	await expect(page).toHaveURL(/\/legal\/terms$/);
	await expect(
		page.getByRole("heading", {
			name: /Terms of Service/i,
		}),
	).toBeVisible();
});
