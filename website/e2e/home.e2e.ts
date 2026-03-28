import { expect, test } from "@playwright/test";

test("landing page renders primary content", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle(/Asset/i);
	await expect(
		page.getByRole("heading", {
			name: /The intelligent platform for investing and financial analysis\./i,
		}),
	).toBeVisible();
});
