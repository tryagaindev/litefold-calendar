import { expect, test } from "@playwright/test";

import {
	expectExampleReady,
	expectNoAutomatedAccessibilityViolations,
	expectOnlyOneGridTabStop
} from "./helpers.js";

test("advanced example exposes semantic calendar structure without automated WCAG violations", async ({ page }, testInfo) => {
	await expectExampleReady(page, "/examples/advanced/");

	const grid = page.getByRole("grid");
	await expect(grid).toBeVisible();
	await expect(grid.getByRole("gridcell")).toHaveCount(42);
	await expectOnlyOneGridTabStop(grid);
	await expect(grid.locator("time[datetime]").first()).toBeVisible();

	const agenda = page.locator("[data-example-calendar] ol");
	await expect(agenda).toHaveCount(1);
	await expect(agenda.locator(":scope > li").first()).toBeVisible();
	await expect(agenda.locator("time[datetime]").first()).toBeVisible();
	const instructions = page.locator("[data-example-grid-instructions]");
	await expect(instructions).not.toHaveText("");
	const instructionId = await instructions.getAttribute("id");
	expect(instructionId).not.toBeNull();
	await expect(grid).toHaveAttribute(
		"aria-describedby",
		new RegExp(`(?:^|\\s)${instructionId}(?:\\s|$)`, "u")
	);

	await expectNoAutomatedAccessibilityViolations(page, testInfo);
});

test("migration recipe is operable and passes automated accessibility checks", async ({ page }, testInfo) => {
	await expectExampleReady(page, "/examples/fullcalendar-v6-migration/");
	await expect(page.getByRole("grid")).toBeVisible();
	await expect(page.locator("[data-example-activation]")).toBeVisible();
	await expectNoAutomatedAccessibilityViolations(page, testInfo);
});

test("progressive enhancement keeps useful semantic content without JavaScript", async ({ browser, baseURL }) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		locale: "en-US",
		timezoneId: "America/Los_Angeles"
	});
	try {
		const page = await context.newPage();
		const response = await page.goto("/examples/progressive-enhancement/");
		expect(response?.ok()).toBe(true);
		const fallback = page.locator("[data-example-fallback]");
		await expect(fallback).toBeVisible();
		await expect(fallback.locator("ol > li")).not.toHaveCount(0);
		const eventLink = fallback.getByRole("link", { name: "Calendar design review" });
		await expect(eventLink).toBeVisible();
		await expect(fallback.locator("time[datetime]").first()).toBeVisible();
		await expect(page.locator("[data-example-calendar]")).toBeEmpty();

		const [eventResponse] = await Promise.all([
			page.waitForNavigation(),
			eventLink.click()
		]);
		expect(eventResponse?.ok()).toBe(true);
		const eventUrl = new URL(page.url());
		expect(eventUrl.searchParams.get("event")).toBe("design-review");
		expect(eventUrl.searchParams.get("from")).toBe("fallback");
		expect(eventUrl.hash).toBe("#server-schedule");
		await expect(page.locator("#server-schedule")).toBeVisible();
	} finally {
		await context.close();
	}
});

test("progressive enhancement coordinates fallback with usable and unavailable states", async ({ page }, testInfo) => {
	await expectExampleReady(page, "/examples/progressive-enhancement/");
	const fallback = page.locator("[data-example-fallback]");
	await expect(fallback).toBeHidden();
	await page.clock.install();
	await page.clock.pauseAt(Date.now() + 1_000);

	await page.locator('[data-example-rebuild="failure"]').click();
	await expect(page.locator('html[data-example-phase="loading"]')).toHaveCount(1);
	await expect(page.locator('html[data-example-ready="false"]')).toHaveCount(1);
	await expect(fallback).toBeVisible();
	await page.clock.runFor(80);
	await expect(page.locator('html[data-example-phase="unavailable"]')).toHaveCount(1);
	await expect(fallback).toBeVisible();
	await expect(page.locator("[data-example-announcer-assertive]")).not.toBeEmpty();

	await page.locator('[data-example-rebuild="success"]').click();
	await expect(page.locator('html[data-example-phase="loading"]')).toHaveCount(1);
	await expect(page.locator('html[data-example-ready="false"]')).toHaveCount(1);
	await expect(fallback).toBeVisible();
	await page.clock.runFor(80);
	await expect(page.locator('html[data-example-ready="true"]')).toHaveCount(1);
	await expect(fallback).toBeHidden();
	await expect(page.locator("[data-example-announcer-assertive]")).toBeEmpty();
	await page.clock.resume();
	await expectNoAutomatedAccessibilityViolations(page, testInfo);
});
