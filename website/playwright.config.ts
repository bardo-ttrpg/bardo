import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(
	process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? "3001",
	10,
);
const defaultHost = process.env.PLAYWRIGHT_LOOPBACK_HOST ?? "localhost";
const defaultBaseUrl = defaultHost.includes(":")
	? `http://[${defaultHost}]:${String(port)}`
	: `http://${defaultHost}:${String(port)}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl;
const webServerCommand = `PLAYWRIGHT_LOOPBACK_HOST=${defaultHost} PORT=${String(port)} bun run dev:e2e`;

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.e2e.ts",
	outputDir: ".playwright/test-results",
	timeout: 30_000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
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
		command: webServerCommand,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
