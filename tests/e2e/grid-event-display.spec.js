import { expect, test } from "@playwright/test";

import { expectLibraryFixtureReady, expectOnlyOneGridTabStop } from "./helpers.js";

const TARGET_DATE = "2026-07-14";

test("compact multiple-event counts are the only new keyboard entry", async ({ page }) => {
	await mountCalendar(page, { width: 320 });
	const { action, count, day, grid } = targets(page);
	await expect(count).toBeVisible();
	await expect(count.locator(".lfc-is-compact")).toHaveText("2");
	await expect(action).toBeHidden();
	await day.focus();
	await day.press("F2");
	await expect(count).toBeFocused();
	await expectOnlyOneGridTabStop(grid);
	await page.keyboard.press("ArrowUp");
	await expect(count).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(count).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator(".lfc-calendar-agenda-title")).toBeFocused();
});

for (const width of [320, 900]) {
	test(`all-event count mode includes singletons at container width ${String(width)}`, async ({ page }) => {
		await mountCalendar(page, { count: 1, display: { compact: "count", wide: "count" }, width });
		const { action, count } = targets(page);
		await expect(count).toBeVisible();
		await expect(count).toHaveAccessibleName(/1 event.+July 14, 2026/u);
		await expect(count.locator(width === 320 ? ".lfc-is-compact" : ".lfc-is-wide")).toHaveText(width === 320 ? "1" : "1 event");
		await expect(action).toBeHidden();
		await expect(page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-07-15"]')).toHaveCount(0);
	});
}

test("a wide-only singleton count creates no empty compact action", async ({ page }) => {
	await mountCalendar(page, { actionable: false, count: 1, display: { compact: "events", wide: "count" }, width: 320 });
	const { count, day } = targets(page);
	await expect(count).toBeHidden();
	await day.focus();
	await day.press("F2");
	await expect(day).toBeFocused();
	await setContainerWidth(page, 900);
	await expect(count).toBeVisible();
	await day.press("F2");
	await expect(count).toBeFocused();
});

test("resizing preserves an active event until blur and skips hidden actions on re-entry", async ({ page }) => {
	await mountCalendar(page, { width: 900, suppressMarkers: true });
	const { action, count, day } = targets(page);
	await day.focus();
	await day.press("F2");
	await expect(action).toBeFocused();
	await setContainerWidth(page, 320);
	await expect(action).toBeFocused();
	await expect(action).toBeVisible();
	await expect(action.locator(".lfc-calendar-event-title")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(day).toBeFocused();
	await expect(action).toBeHidden();
	await day.press("F2");
	await expect(count).toBeFocused();
	await setContainerWidth(page, 900);
	await expect(count).toBeFocused();
	await expect(count).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(count).toBeHidden();
	await day.press("F2");
	await expect(action).toBeFocused();
});

test("container resizing keeps count labels, nodes, source calls and render hooks stable", async ({ page }) => {
	await mountCalendar(page, { count: 4, width: 320 });
	const { count } = targets(page);
	await expect(count).toHaveAccessibleName(/4 events.+1 more/u);
	const label = await count.getAttribute("aria-label");
	const before = await page.evaluate(() => {
		const fixture = window.gridCountFixture;
		fixture.savedCount = fixture.host.querySelector(".lfc-calendar-grid-more");
		fixture.savedEvent = fixture.host.querySelector("[data-lfc-event-id]");
		return { hooks: fixture.hooks, requests: fixture.requests };
	});
	await setContainerWidth(page, 900);
	await expect(count.locator(".lfc-is-wide")).toBeVisible();
	await expect(count.locator(".lfc-is-wide")).toHaveText("1 more");
	await setContainerWidth(page, 320);
	await expect(count.locator(".lfc-is-compact")).toBeVisible();
	await expect(count).toHaveAttribute("aria-label", label);
	expect(await page.evaluate(() => {
		const fixture = window.gridCountFixture;
		return {
			hooks: fixture.hooks,
			requests: fixture.requests,
			sameCount: fixture.savedCount === fixture.host.querySelector(".lfc-calendar-grid-more"),
			sameEvent: fixture.savedEvent === fixture.host.querySelector("[data-lfc-event-id]")
		};
	})).toEqual({ ...before, sameCount: true, sameEvent: true });
});

test("count action cancellation allows an app-owned dialog and restores its initiating action", async ({ page }) => {
	await mountCalendar(page, { dialog: true, width: 320 });
	const { count } = targets(page);
	await count.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Close chooser" })).toBeFocused();
	await dialog.getByRole("button", { name: "Close chooser" }).click();
	await expect(dialog).toBeHidden();
	await expect(count).toBeFocused();
	expect(await page.evaluate(() => window.gridCountFixture.calendar.getState().selectedDate.day)).toBe(13);
});

test("count controls remain usable in a 320px RTL container with enlarged text", async ({ page }) => {
	await mountCalendar(page, { display: { compact: "count", wide: "count" }, rtl: true, width: 320 });
	await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
	const { count, day } = targets(page);
	await expect(count).toBeVisible();
	await expect(count).toHaveAccessibleName(/2 events/u);
	const box = await count.boundingBox();
	expect(box).not.toBeNull();
	expect(box.width).toBeGreaterThanOrEqual(24);
	expect(box.height).toBeGreaterThanOrEqual(24);
	expect(await page.locator("[data-my-calendar]").evaluate((host) => host.scrollWidth - host.clientWidth)).toBeLessThanOrEqual(1);
	await day.focus();
	await day.press("F2");
	await expect(count).toBeFocused();
});

async function mountCalendar(page, settings = {}) {
	await page.setViewportSize({ width: 1200, height: 1200 });
	await expectLibraryFixtureReady(page);
	await page.evaluate(async (settings) => {
		const { createCalendar } = await import("/dist/index.js");
		const host = document.querySelector("[data-my-calendar]");
		host.style.inlineSize = `${String(settings.width ?? 320)}px`;
		if (settings.rtl) { host.dir = "rtl"; }
		const fixture = { errors: [], host, hooks: 0, requests: 0 };
		const options = {
			events: () => {
				fixture.requests += 1;
				return Array.from({ length: settings.count ?? 2 }, (_, index) => ({
					id: `count-${String(index)}`,
					start: "2026-07-14T09:00",
					title: `Event ${String(index)}`
				}));
			},
			initialDate: settings.dialog ? "2026-07-13" : "2026-07-14",
			locale: "en-US",
			maxGridEventsPerDay: 3,
			onError: (error) => { fixture.errors.push({ code: error.code, hook: error.hook, message: error.message, cause: String(error.cause) }); },
			now: () => new Date("2026-07-14T12:00:00.000Z"),
			renderHooks: [{
				id: "count-browser-fixture",
				...(settings.suppressMarkers ? { renderEventMarker: () => null } : {}),
				renderEventOverflow: () => { fixture.hooks += 1; return undefined; }
			}]
		};
		if (settings.actionable !== false) { options.onEventActivate = () => {}; }
		if (settings.display) { options.gridEventDisplay = settings.display; }
		if (settings.dialog) {
			const dialog = document.createElement("dialog");
			dialog.setAttribute("aria-label", "Choose an event");
			const close = document.createElement("button");
			close.textContent = "Close chooser";
			dialog.append(close);
			document.body.append(dialog);
			let origin;
			close.addEventListener("click", () => { dialog.close(); origin?.focus(); });
			options.onEventOverflowActivate = ({ element, nativeEvent }) => {
				nativeEvent.preventDefault();
				origin = element;
				dialog.showModal();
			};
		}
		fixture.calendar = createCalendar(host, options);
		Object.defineProperty(window, "gridCountFixture", { configurable: true, value: fixture });
		fixture.calendar.render();
	}, settings);
	await expect(page.getByRole("grid")).toBeVisible();
	await expect.poll(() => page.evaluate(() => ({
		errors: window.gridCountFixture.errors,
		phase: window.gridCountFixture.calendar.getState().phase
	}))).toEqual({ errors: [], phase: "ready" });
}

function targets(page) {
	const day = page.locator(`.lfc-calendar-day-button[data-lfc-date="${TARGET_DATE}"]`);
	return {
		action: day.locator('..').locator(':is(button, a)[data-lfc-event-id="count-0"]'),
		count: page.locator(`.lfc-calendar-grid-more[data-lfc-date="${TARGET_DATE}"]`),
		day,
		grid: page.getByRole("grid")
	};
}

async function setContainerWidth(page, width) {
	await page.locator("[data-my-calendar]").evaluate((host, width) => { host.style.inlineSize = `${String(width)}px`; }, width);
}
