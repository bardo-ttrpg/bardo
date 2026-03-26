import { expect, test } from "@playwright/test";

test("primary navigation opens pricing and legal pages", async ({ page }) => {
	await page.goto("/");

	const primaryNav = page.getByRole("navigation", { name: "Primary" });
	const pricingLink = primaryNav.getByRole("link", { name: "Pricing" });
	const legalLink = primaryNav.getByRole("link", { name: "Legal" });

	await expect(pricingLink).toHaveAttribute("href", "/pricing");
	await page.goto("/pricing");
	await expect(page).toHaveURL(/\/pricing$/);
	await expect(
		page.getByRole("heading", {
			name: /One subscription unlocks the full Bardo MCP toolset/i,
		}),
	).toBeVisible();

	await page.goto("/");
	await expect(legalLink).toHaveAttribute("href", "/legal");
	await page.goto("/legal");
	await expect(page).toHaveURL(/\/legal$/);
	await expect(
		page.getByRole("heading", {
			name: /Policies and terms/i,
		}),
	).toBeVisible();
});

test("hero CTA view pricing opens pricing page", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("link", { name: /View pricing/i }).first(),
	).toHaveAttribute("href", "/pricing");
	await page.goto("/pricing");
	await expect(page).toHaveURL(/\/pricing$/);
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
