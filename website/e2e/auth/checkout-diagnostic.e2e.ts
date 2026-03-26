import { test } from "@playwright/test";

test.skip(
	!process.env.BARDO_FULL_LIVE_E2E,
	"Run only for explicit local live checkout diagnostics.",
);

test("inspect Clerk Billing checkout flow for the paid plan", async ({
	page,
	context,
}) => {
	await page.goto("/pricing");

	const beforeBilling = await page.evaluate(async () => {
		const response = await fetch("/api/billing");
		return await response.json();
	});
	console.log("beforeBilling", JSON.stringify(beforeBilling));

	const maybePopup = context
		.waitForEvent("page", { timeout: 15_000 })
		.catch(() => null);
	await page.getByRole("button", { name: /start solo/i }).click();
	const popup = await maybePopup;
	const activePage = popup ?? page;

	await activePage.waitForLoadState("domcontentloaded");
	await activePage.waitForTimeout(5_000);

	const afterUrl = activePage.url();
	const textSample = (await activePage.locator("body").innerText()).slice(
		0,
		5000,
	);
	console.log("afterUrl", afterUrl);
	console.log("textSample", textSample);

	await activePage.screenshot({
		path: "/home/armando/projects/01-bardo-test/checkout-diagnostic.png",
		fullPage: true,
	});
});
