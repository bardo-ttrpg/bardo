import { expect, test } from "@playwright/test";

test("primary navigation links to exported sections and pages", async ({
	page,
}) => {
	await page.goto("/");

	await expect(
		page.getByRole("link", { name: "Overview" }).first(),
	).toHaveAttribute("href", "/#overview");
	await expect(
		page.getByRole("link", { name: "Features" }).first(),
	).toHaveAttribute("href", "/#features");
	await expect(
		page.getByRole("link", { name: "Pricing" }).first(),
	).toHaveAttribute("href", "/#pricing");

	await expect(
		page.getByRole("link", { name: "Contact" }).last(),
	).toHaveAttribute("href", "/contact");
	await expect(
		page.getByRole("link", { name: "Privacy Policy" }).last(),
	).toHaveAttribute("href", "/privacy-policy");
});

test("contact and privacy pages render exported template copy", async ({
	page,
}) => {
	await page.goto("/contact");
	await expect(
		page.getByRole("heading", {
			name: /Get in touch with us/i,
		}),
	).toBeVisible();
	await expect(page.getByText(/contact@asset.com/i)).toBeVisible();

	await page.goto("/privacy-policy");
	await expect(page.locator("h1", { hasText: "Privacy policy" })).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /1\. Information We Collect/i,
		}),
	).toBeVisible();
});

test("homepage shows exported pricing cards and faq", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", {
			name: /Simple pricing that scales with your needs/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /Everything explained to help you move forward/i,
		}),
	).toBeVisible();
});

test("404 page follows the exported template copy", async ({ page }) => {
	await page.goto("/does-not-exist");
	await expect(
		page.getByRole("heading", {
			name: /Page not found/i,
		}),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /Back to home/i })).toBeVisible();
});
