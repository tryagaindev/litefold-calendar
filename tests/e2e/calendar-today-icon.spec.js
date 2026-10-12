import { expect, test } from "@playwright/test";

import { expectExampleReady, expectLibraryFixtureReady, expectNoAutomatedAccessibilityViolations } from "./helpers.js";

test.use({ bypassCSP: true });

test("the advanced example demonstrates the optional Today icon with accessible text at both widths", async ({ page }, testInfo) => {
	await expectExampleReady(page, "/examples/advanced/");
	const today = page.locator("[data-my-calendar]").getByRole("button", { name: "Today", exact: true });
	const icon = today.locator(".my-today-icon");
	const label = today.locator(".lfc-calendar-today-label");
	await expect(label).toBeVisible();
	await expect(icon).toBeHidden();
	await today.focus();
	await page.setViewportSize({ height: 844, width: 390 });
	await expect(icon).toBeVisible();
	await expect(label).toBeHidden();
	await expect(today).toBeFocused();
	await expect(today).toHaveAccessibleName("Today");
	await expectNoAutomatedAccessibilityViolations(page, testInfo);
	await page.setViewportSize({ height: 900, width: 1440 });
	await expect(label).toBeVisible();
	await expect(icon).toBeHidden();
	await expect(today).toBeFocused();
	await expect(today).toHaveAccessibleName("Today");
});

for (const custom of [false, true]) {
	test(`Today preserves naming, focus and navigation across widths (${custom ? "optional icon" : "default text"})`, async ({ page }, testInfo) => {
		await expectLibraryFixtureReady(page);
		await page.addStyleTag({ content: ".my-today-calendar { box-sizing: content-box; inline-size: 900px; max-inline-size: none; }" });
		await page.evaluate(async (withIcon) => {
			const { createCalendar } = await import("/dist/index.js");
			const host = document.querySelector("[data-my-calendar]");
			host.className = "my-today-calendar";
			const fixture = { factoryCalls: 0, icon: null };
			const calendar = createCalendar(host, {
				events: [],
				...(withIcon ? { icons: { today: (ownerDocument) => {
					fixture.factoryCalls += 1;
					const icon = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
					icon.classList.add("my-today-icon");
					icon.setAttribute("viewBox", "0 0 24 24");
					icon.setAttribute("width", "1.25em");
					icon.setAttribute("height", "1.25em");
					icon.setAttribute("fill", "none");
					icon.setAttribute("stroke", "currentColor");
					const path = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
					path.setAttribute("d", "M4 5h16v15H4zM4 9h16M8 3v4m8-4v4m-5 6h2v2h-2z");
					icon.append(path);
					fixture.icon = icon;
					return icon;
				} } } : {}),
				initialDate: "2026-08-04",
				messages: { today: "Go to today" },
				now: () => new Date("2026-08-09T12:00:00Z"),
				timeZone: "UTC"
			});
			calendar.render();
			window.todayIconFixture = Object.assign(fixture, { calendar });
		}, custom);
		const host = page.locator("[data-my-calendar]");
		const today = host.getByRole("button", { name: "Go to today", exact: true });
		const originalButton = await today.elementHandle();
		const icon = today.locator(".my-today-icon");
		await today.focus();

		for (const width of [900, 384, 383, 320, 384, 900]) {
			await host.evaluate((element, value) => { element.style.inlineSize = `${String(value)}px`; }, width);
			await expect(today).toBeFocused();
			await expect(today).toMatchAriaSnapshot('- button "Go to today"');
			expect(await today.evaluate((element, original) => element === original, originalButton)).toBe(true);
			if (custom) {
				if (width < 384) {
					await expect(icon).toBeVisible();
					await expect(today.locator(".lfc-calendar-today-label")).toBeHidden();
				} else {
					await expect(icon).toBeHidden();
					await expect(today.locator(".lfc-calendar-today-label")).toBeVisible();
				}
				expect(await icon.evaluate((element) => element === window.todayIconFixture.icon)).toBe(true);
			} else {
				await expect(today).toHaveText("Go to today");
				await expect(icon).toHaveCount(0);
			}
			const box = await today.boundingBox();
			expect(box).not.toBeNull();
			expect(box.width).toBeGreaterThanOrEqual(24);
			expect(box.height).toBeGreaterThanOrEqual(24);
		}

		await host.evaluate((element) => { element.style.inlineSize = "320px"; element.dir = "rtl"; });
		if (custom) {
			await expect(icon).toBeVisible();
			await expect(icon).toHaveCSS("transform", "none");
			await testInfo.attach("compact-today-icon", { body: await host.screenshot(), contentType: "image/png" });
		}
		await today.press("Enter");
		expect(await page.evaluate(() => window.todayIconFixture.calendar.getState().selectedDate))
			.toEqual({ day: 9, month: 8, year: 2026 });
		await expect(today).toBeFocused();
		await host.getByRole("button", { name: "Next month", exact: true }).click();
		await today.focus();
		await today.press("Space");
		expect(await page.evaluate(() => window.todayIconFixture.calendar.getState().selectedDate))
			.toEqual({ day: 9, month: 8, year: 2026 });
		await expect(today).toBeFocused();
		expect(await page.evaluate(() => window.todayIconFixture.factoryCalls)).toBe(custom ? 1 : 0);
		await originalButton.dispose();
		await page.evaluate(() => { window.todayIconFixture.calendar.destroy(); });
		expect(await page.evaluate(() => window.todayIconFixture.icon?.parentNode ?? null)).toBeNull();
	});
}
