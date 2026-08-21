import { defineConfig, devices } from "@playwright/test";

import { assertSupportedNodeVersion } from "./scripts/lib/node-version.mjs";

const DEFAULT_PORT = 4173;

assertSupportedNodeVersion("Playwright validation");

const configuredPort = process.env["LFC_PLAYWRIGHT_PORT"] ?? String(DEFAULT_PORT);
if (!/^\d{1,5}$/u.test(configuredPort)) {
	throw new Error("LFC_PLAYWRIGHT_PORT must be a decimal TCP port.");
}
const port = Number(configuredPort);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
	throw new Error("LFC_PLAYWRIGHT_PORT must be between 1 and 65535.");
}

const origin = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
	expect: {
		timeout: 5_000
	},
	forbidOnly: Boolean(process.env["CI"]),
	fullyParallel: true,
	globalSetup: "./tests/e2e/global-setup.js",
	outputDir: "test-results/playwright",
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"]
			}
		}
	],
	reporter: process.env["CI"]
		? [["github"], ["line"]]
		: [["list"]],
	retries: process.env["CI"] ? 1 : 0,
	testDir: "./tests/e2e",
	timeout: 30_000,
	use: {
		baseURL: origin,
		colorScheme: "light",
		locale: "en-US",
		reducedMotion: "reduce",
		screenshot: "only-on-failure",
		timezoneId: "America/Los_Angeles",
		trace: "retain-on-failure",
		video: "off"
	},
	workers: process.env["CI"] ? 2 : undefined
});
