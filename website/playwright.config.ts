import "./e2e/load-next-env";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { authStorageStatePath } from "./e2e/clerk-env";
import {
	resolvePlaywrightBaseUrl,
	resolvePlaywrightExtraHttpHeaders,
	resolvePlaywrightLocalAppUrl,
	resolvePlaywrightWebServerHost,
	resolvePlaywrightWebServerPort,
	shouldStartPlaywrightWebServer,
} from "./e2e/playwright-config-lib";

const port = Number.parseInt(
	process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? "3001",
	10,
);
const baseURL = resolvePlaywrightBaseUrl(process.env, port);
const webServerHost = resolvePlaywrightWebServerHost(process.env, baseURL);
const webServerPort = resolvePlaywrightWebServerPort(
	process.env,
	baseURL,
	port,
);
const localAppUrl = resolvePlaywrightLocalAppUrl(webServerHost, webServerPort);
const extraHTTPHeaders = resolvePlaywrightExtraHttpHeaders(process.env);
const webServerCommand = `PLAYWRIGHT_LOOPBACK_HOST=${webServerHost} NEXT_PUBLIC_APP_URL=${localAppUrl} PORT=${String(webServerPort)} bun run dev:e2e`;
const webServer = shouldStartPlaywrightWebServer(baseURL)
	? {
			command: webServerCommand,
			url: baseURL,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			stdout: "pipe" as const,
			stderr: "pipe" as const,
		}
	: undefined;

export default defineConfig({
	testDir: "./e2e",
	testMatch: [/.*\.e2e\.ts$/, /.*\.setup\.ts$/],
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
		extraHTTPHeaders,
	},
	projects: [
		{
			name: "setup",
			testMatch: /setup\/.*\.setup\.ts$/,
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "chromium",
			testIgnore: ["**/auth/**/*.e2e.ts", "**/setup/**/*.setup.ts"],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "chromium-auth",
			dependencies: ["setup"],
			testMatch: /auth\/.*\.e2e\.ts$/,
			use: {
				...devices["Desktop Chrome"],
				storageState: resolve(authStorageStatePath),
			},
		},
	],
	webServer,
});
