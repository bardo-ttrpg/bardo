import { expect, test } from "@playwright/test";

test("landing page renders primary content", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle(/Bardo/i);
	await expect(page.getByText(/Bardo/i).first()).toBeVisible();
});
