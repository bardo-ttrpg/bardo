import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import {
	authStorageStatePath,
	ensureAuthStorageDir,
	ensureClerkTestUserExists,
} from "../clerk-env";

setup("authenticate Clerk test user", async ({ page }) => {
	const { email, password, phoneNumber, strategy, warnings } =
		await ensureClerkTestUserExists();

	await clerkSetup({
		publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		secretKey: process.env.CLERK_SECRET_KEY,
	});

	for (const warning of warnings) {
		console.warn(`warning: ${warning}`);
	}

	await page.goto("/");
	if (strategy === "password") {
		await clerk.signIn({
			page,
			signInParams: {
				strategy: "password",
				identifier: email ?? "",
				password: password ?? "",
			},
		});
	} else if (strategy === "email_code") {
		await clerk.signIn({
			page,
			signInParams: {
				strategy: "email_code",
				identifier: email ?? "",
			},
		});
	} else {
		await clerk.signIn({
			page,
			signInParams: {
				strategy: "phone_code",
				identifier: phoneNumber ?? "",
			},
		});
	}

	await page.goto("/dashboard");
	await expect(page).toHaveURL(/\/dashboard$/);

	ensureAuthStorageDir();
	await page.context().storageState({ path: authStorageStatePath });
});
