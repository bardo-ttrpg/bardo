import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const defaultHost = process.env.PLAYWRIGHT_LOOPBACK_HOST ?? "::1";
const defaultBaseUrl = defaultHost.includes(":")
	? `http://[${defaultHost}]:${String(port)}`
	: `http://${defaultHost}:${String(port)}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl;

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.e2e.ts",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	fullyParallel: true,
	reporter: [["list"]],
	use: {
		baseURL,
		trace: "on-first-retry",
		headless: true,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run dev",
		url: baseURL,
		// Force deterministic startup to avoid long probe hangs on some local runtimes (e.g. WSL).
		reuseExistingServer: false,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
