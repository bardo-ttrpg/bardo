import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CheckoutButton from "./checkout-button";
import SubscriptionDetailsCta from "./subscription-details-button";

describe("pricing Clerk guard", () => {
	test("renders subscription CTA without Clerk provider when disabled", () => {
		expect(() =>
			renderToStaticMarkup(<SubscriptionDetailsCta clerkEnabled={false} />),
		).not.toThrow();
	});

	test("renders checkout CTA without Clerk provider when disabled", () => {
		expect(() =>
			renderToStaticMarkup(
				<CheckoutButton
					clerkEnabled={false}
					clerkPlanId={null}
					planPeriod="month"
					label="Start Solo"
					className="btn"
				/>,
			),
		).not.toThrow();
	});
});
