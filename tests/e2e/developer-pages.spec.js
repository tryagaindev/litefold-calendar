import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { expectNoAutomatedAccessibilityViolations } from "./helpers.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RELEASE_VERSION = "0.2.0-alpha.0";
const EXAMPLE_ROUTES = Object.freeze([
	["basic", "/examples/basic/"],
	["advanced", "/examples/advanced/"],
	["asynchronous errors", "/examples/async-errors/"],
	["classic script", "/examples/classic-script/"],
	["migration", "/examples/fullcalendar-v6-migration/"],
	["progressive enhancement", "/examples/progressive-enhancement/"]
]);
const PAGES_INDEX = new URL("../../scripts/pages-site/index.html", import.meta.url);
const PAGES_MARK = new URL("../../docs/assets/litefold-calendar-mark.svg", import.meta.url);
const PAGES_SCRIPT = new URL("../../scripts/pages-site/site.js", import.meta.url);
const PAGES_STYLE = new URL("../../scripts/pages-site/site.css", import.meta.url);

function releaseManifest() {
	return {
		main: {
			channel: "main",
			commit: COMMIT,
			path: "main/examples/",
			version: RELEASE_VERSION
		},
		releases: [{
			channel: "release",
			commit: COMMIT,
			path: `releases/${RELEASE_VERSION}/examples/`,
			version: RELEASE_VERSION
		}],
		schemaVersion: 1
	};
}

async function mountPagesShell(page, baseURL, manifest = releaseManifest()) {
	const [htmlSource, markSource, scriptSource, styleSource] = await Promise.all([
		readFile(PAGES_INDEX, "utf8"),
		readFile(PAGES_MARK, "utf8"),
		readFile(PAGES_SCRIPT, "utf8"),
		readFile(PAGES_STYLE, "utf8")
	]);
	await page.route("**/examples/litefold-calendar-mark.svg", async (route) => route.fulfill({
		body: markSource,
		contentType: "image/svg+xml",
		status: 200
	}));
	await page.route("**/examples/site.css", async (route) => route.fulfill({
		body: styleSource,
		contentType: "text/css",
		status: 200
	}));
	await page.route("**/examples/site.js", async (route) => route.fulfill({
		body: scriptSource,
		contentType: "text/javascript",
		status: 200
	}));
	await page.route("**/site-manifest.json", async (route) => route.fulfill({
		body: JSON.stringify(manifest),
		contentType: "application/json",
		status: 200
	}));
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async (value) => {
					globalThis.__lfcCopiedText = value;
				}
			}
		});
	});
	await page.goto(`${baseURL}/examples/`, { waitUntil: "domcontentloaded" });
	await page.setContent(htmlSource, { waitUntil: "domcontentloaded" });
	const expectedSummary = manifest.releases.length > 0
		? `release ${manifest.releases[0].version}`
		: `main at ${manifest.main?.commit ?? ""}`;
	await expect(page.locator("#deployment-summary")).toContainText(expectedSummary);
}

async function codeBlockFocusStyle(locator) {
	await locator.focus();
	return locator.evaluate((element) => {
		const block = element.closest(".lfc-pages-code-block");
		const code = block?.querySelector("code");
		if (!(block instanceof HTMLElement) || !(code instanceof HTMLElement)) {
			throw new Error("Focused code-block element is missing its code content.");
		}
		const style = getComputedStyle(element);
		return {
			backgroundColor: getComputedStyle(block).backgroundColor,
			codeColor: getComputedStyle(code).color,
			color: style.outlineColor,
			offset: Number.parseFloat(style.outlineOffset),
			style: style.outlineStyle,
			width: Number.parseFloat(style.outlineWidth)
		};
	});
}

function contrastRatio(first, second) {
	const relativeLuminance = (color) => {
		const channels = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
		if (channels?.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
			throw new Error(`Expected a computed RGB color; received ${color}.`);
		}
		const linear = channels.map((channel) => {
			const normalized = channel / 255;
			return normalized <= 0.04045
				? normalized / 12.92
				: ((normalized + 0.055) / 1.055) ** 2.4;
		});
		return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
	};
	const firstLuminance = relativeLuminance(first);
	const secondLuminance = relativeLuminance(second);
	return (Math.max(firstLuminance, secondLuminance) + 0.05) /
		(Math.min(firstLuminance, secondLuminance) + 0.05);
}

for (const [name, route] of EXAMPLE_ROUTES) {
	test(`${name} recipe loads and passes automated accessibility checks`, async ({ page }, testInfo) => {
		const response = await page.goto(route, { waitUntil: "domcontentloaded" });
		expect(response?.ok(), `Expected ${route} to return a successful response.`).toBe(true);
		const host = page.locator(".litefold-calendar").first();
		await expect(host).toBeVisible();
		await expect(host).not.toHaveAttribute("aria-busy", "true");
		await expectNoAutomatedAccessibilityViolations(page, testInfo);
	});
}

test("examples landing exposes six keyboard-visible task cards", async ({ page }, testInfo) => {
	const response = await page.goto("/examples/", { waitUntil: "domcontentloaded" });
	expect(response?.ok()).toBe(true);
	await expect(page.locator(".example-card")).toHaveCount(6);
	await page.keyboard.press("Tab");
	const skipLink = page.getByRole("link", { name: "Skip to examples" });
	await expect(skipLink).toBeFocused();
	const focus = await skipLink.evaluate((element) => {
		const style = getComputedStyle(element);
		return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
	});
	expect(focus.style).toBe("solid");
	expect(focus.width).toBeGreaterThan(0);
	await page.keyboard.press("Enter");
	await expect(page.locator("#example-list")).toBeFocused();
	await expectNoAutomatedAccessibilityViolations(page, testInfo);
});

for (const colorScheme of ["light", "dark"]) {
	test(`Pages code-block focus remains visible in the ${colorScheme} theme`, async ({
		baseURL,
		page
	}) => {
		if (typeof baseURL !== "string") {
			throw new Error("Pages shell browser coverage requires a base URL.");
		}
		await page.emulateMedia({ colorScheme });
		await mountPagesShell(page, baseURL);

		const installCode = page.getByLabel("Install command", { exact: true });
		const codeFocus = await codeBlockFocusStyle(installCode);
		expect(codeFocus.style).toBe("solid");
		expect(codeFocus.width).toBeGreaterThan(0);
		expect(codeFocus.offset + codeFocus.width).toBeLessThanOrEqual(0);
		expect(codeFocus.color).toBe(codeFocus.codeColor);
		expect(contrastRatio(codeFocus.color, codeFocus.backgroundColor)).toBeGreaterThanOrEqual(3);

		const copyButton = page.getByRole("button", { name: "Copy install command" });
		const buttonFocus = await codeBlockFocusStyle(copyButton);
		expect(buttonFocus.style).toBe("solid");
		expect(buttonFocus.width).toBeGreaterThan(0);
		expect(buttonFocus.color).toBe(buttonFocus.codeColor);
		expect(contrastRatio(buttonFocus.color, buttonFocus.backgroundColor)).toBeGreaterThanOrEqual(3);
	});
}

test("Pages shell supports keyboard, copy status, preferences, and narrow reflow", async ({
	baseURL,
	page
}, testInfo) => {
	if (typeof baseURL !== "string") {
		throw new Error("Pages shell browser coverage requires a base URL.");
	}
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.setViewportSize({ height: 844, width: 390 });
	await mountPagesShell(page, baseURL);
	const projectMark = page.locator(".lfc-pages-mark");
	await expect(projectMark).toBeVisible();
	await expect(projectMark).toHaveAttribute("alt", "");
	expect(await projectMark.evaluate((image) =>
		image instanceof HTMLImageElement && image.complete &&
		image.naturalWidth > 0 && image.naturalHeight > 0
	)).toBe(true);

	await page.keyboard.press("Tab");
	const skipLink = page.getByRole("link", { name: "Skip to main content" });
	await expect(skipLink).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("#lfc-pages-content")).toBeFocused();

	const installCode = page.getByLabel("Install command", { exact: true });
	await installCode.focus();

	await page.getByRole("button", { name: "Copy install command" }).click();
	await expect(page.locator("#copy-status")).toHaveText("Install command copied.");
	expect(await page.evaluate(() => globalThis.__lfcCopiedText)).toBe(
		`npm install @tryagaindev/litefold-calendar@${RELEASE_VERSION}`
	);
	await page.evaluate(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: async () => { throw new Error("Denied"); } }
		});
	});
	await page.getByRole("button", { name: "Copy install command" }).click();
	await expect(page.locator("#copy-status")).toContainText("selected");
	expect(await page.evaluate(() => getSelection()?.toString())).toBe(
		`npm install @tryagaindev/litefold-calendar@${RELEASE_VERSION}`
	);

	expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
	expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

	await page.emulateMedia({ forcedColors: "active" });
	expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
	await expect(page.getByRole("link", { name: "Run basic example" })).toBeVisible();
	await expectNoAutomatedAccessibilityViolations(page, testInfo);
});

test("Pages shell wraps full provenance commits at 320px", async ({ baseURL, page }) => {
	if (typeof baseURL !== "string") {
		throw new Error("Pages shell browser coverage requires a base URL.");
	}
	await page.setViewportSize({ height: 844, width: 320 });
	await mountPagesShell(page, baseURL, {
		main: {
			channel: "main",
			commit: COMMIT,
			path: "main/examples/",
			version: RELEASE_VERSION
		},
		releases: [],
		schemaVersion: 1
	});

	await expect(page.locator("#deployment-summary")).toContainText(COMMIT);
	await expect(page.locator("#main-preview")).toContainText(COMMIT);
	const widths = await page.evaluate(() => ({
		document: document.documentElement.scrollWidth,
		previewClient: document.querySelector("#main-preview")?.clientWidth ?? 0,
		previewScroll: document.querySelector("#main-preview")?.scrollWidth ?? 0,
		summaryClient: document.querySelector("#deployment-summary")?.clientWidth ?? 0,
		summaryScroll: document.querySelector("#deployment-summary")?.scrollWidth ?? 0,
		viewport: innerWidth
	}));
	expect(widths.document).toBeLessThanOrEqual(widths.viewport);
	expect(widths.previewScroll).toBeLessThanOrEqual(widths.previewClient);
	expect(widths.summaryScroll).toBeLessThanOrEqual(widths.summaryClient);
});
