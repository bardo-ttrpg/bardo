import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const dashboardClientSource = readFileSync(
	new URL("./dashboard-client.tsx", import.meta.url),
	"utf8",
);

describe("DashboardClient", () => {
	test("renders the Clerk user profile on the dashboard catch-all route", () => {
		expect(dashboardClientSource).toContain("<UserProfile");
		expect(dashboardClientSource).toContain('path="/dashboard"');
		expect(dashboardClientSource).toContain('routing="path"');
	});

	test("waits for Clerk to load and redirects if the session disappears", () => {
		expect(dashboardClientSource).toContain("<ClerkLoaded>");
		expect(dashboardClientSource).toContain("useUser()");
		expect(dashboardClientSource).toContain("isSignedIn ? (");
		expect(dashboardClientSource).toContain("<RedirectToSignIn />");
	});
});
