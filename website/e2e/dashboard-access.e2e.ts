import { expect, test } from "@playwright/test";
import { isClerkAuthConfigured } from "@/lib/clerk-config";

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

test("dashboard access falls back according to Clerk configuration", async ({
	page,
}) => {
	await page.goto("/dashboard");

	if (!IS_CLERK_CONFIGURED) {
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByText(/Bardo/i).first()).toBeVisible();
		return;
	}

	await expect(page).toHaveURL(/\/sign-in/);
	await expect(page.getByText(/Sign in/i).first()).toBeVisible();
});
