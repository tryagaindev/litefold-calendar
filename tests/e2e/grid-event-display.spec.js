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

for (const update of ["setEvents", "refetchEvents"]) {
	test(`${update} restores focus to the visible count after resizing a focused event`, async ({ page }) => {
		await mountCalendar(page, { width: 900, suppressMarkers: true });
		const { action, count, day, grid } = targets(page);
		await day.focus();
		await day.press("F2");
		await expect(action).toBeFocused();
		await setContainerWidth(page, 320);
		await expect(action).toBeFocused();
		await expect(action).toBeVisible();

		await page.evaluate((update) => {
			const fixture = window.gridCountFixture;
			fixture.savedEvent = document.activeElement;
			if (update === "refetchEvents") {
				fixture.titlePrefix = "Updated event";
				fixture.calendar.refetchEvents();
			} else {
				fixture.calendar.setEvents([0, 1].map((index) => ({
					id: `count-${String(index)}`,
					start: "2026-07-14T09:00",
					title: `Updated event ${String(index)}`
				})));
			}
		}, update);

		await expect(count).toBeFocused();
		await expect(count).toBeVisible();
		await expect(action).toBeHidden();
		await expectOnlyOneGridTabStop(grid);
		expect(await page.evaluate(() => {
			const fixture = window.gridCountFixture;
			return {
				oldActionConnected: fixture.savedEvent.isConnected,
				requests: fixture.requests,
				sameAction: fixture.savedEvent === fixture.host.querySelector('[data-lfc-event-id="count-0"]')
			};
		})).toEqual({ oldActionConnected: false, requests: update === "refetchEvents" ? 2 : 1, sameAction: false });

		await page.keyboard.press("ArrowUp");
		await expect(count).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(day).toBeFocused();
		await day.press("F2");
		await expect(count).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.locator(".lfc-calendar-agenda-title")).toBeFocused();
	});
}

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

for (const total of [12, 123]) {
	for (const enlarged of [false, true]) {
		for (const rtl of [false, true]) {
			test(`${String(total)} compact events fit at ${enlarged ? "200%" : "normal"} text in ${rtl ? "RTL" : "LTR"}`, async ({ page }) => {
				await mountCalendar(page, { count: total, rtl, width: 320 });
				const { count, day, grid } = targets(page);
				const normalFontSize = await count.locator(".lfc-is-compact").evaluate((label) =>
					Number.parseFloat(getComputedStyle(label).fontSize));
				if (enlarged) {
					await page.evaluate(() => {
						const root = document.documentElement;
						root.style.fontSize = `${String(Number.parseFloat(getComputedStyle(root).fontSize) * 2)}px`;
					});
				}
				await expect(count.locator(".lfc-is-compact")).toHaveText(String(total));
				await day.focus();
				await day.press("F2");
				await expect(count).toBeFocused();
				await expectOnlyOneGridTabStop(grid);
				const geometry = await count.evaluate((button) => {
					const rect = (element) => {
						const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
						return { left, top, right, bottom, width, height };
					};
					const box = rect(button);
					const style = getComputedStyle(button);
					const outlineWidth = Number.parseFloat(style.outlineWidth);
					const outlineOffset = Number.parseFloat(style.outlineOffset);
					const outerExtent = Math.max(0, outlineWidth + outlineOffset);
					const innerInset = Math.max(0, -outlineOffset);
					const label = button.querySelector(".lfc-is-compact");
					const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
					const lines = [];
					while (walker.nextNode()) {
						if (walker.currentNode.textContent.trim().length === 0) { continue; }
						const range = document.createRange();
						range.selectNodeContents(walker.currentNode);
						for (const { left, top, right, bottom, width, height } of range.getClientRects()) {
							if (width > 0 && height > 0) { lines.push({ left, top, right, bottom }); }
						}
					}
					return {
						box,
						cell: rect(button.closest(".lfc-calendar-day")),
						fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
						focusVisible: button.matches(":focus-visible"),
						lines,
						outlineStyle: style.outlineStyle,
						outlineWidth,
						ring: { left: box.left - outerExtent, top: box.top - outerExtent, right: box.right + outerExtent, bottom: box.bottom + outerExtent },
						ringInterior: { left: box.left + innerInset, top: box.top + innerInset, right: box.right - innerInset, bottom: box.bottom - innerInset }
					};
				});
				expect(geometry.box.width).toBeGreaterThanOrEqual(24);
				expect(geometry.box.height).toBeGreaterThanOrEqual(24);
				expect(geometry.fontSize).toBeCloseTo(normalFontSize * (enlarged ? 2 : 1), 1);
				expect(geometry.focusVisible).toBe(true);
				expect(geometry.outlineStyle).not.toBe("none");
				expect(geometry.outlineWidth).toBeGreaterThan(0);
				expectRectInside(geometry.box, geometry.cell, "count button inside its day");
				expectRectInside(geometry.ring, geometry.box, "focus ring inside its button");
				expectRectInside(geometry.ring, geometry.cell, "focus ring inside its day");
				expect(geometry.lines.length).toBeGreaterThan(0);
				for (const line of geometry.lines) {
					expectRectInside(line, geometry.ringInterior, "count text inside its focus ring");
				}
				await expectDayNumberContained(page, "2026-07-06");
				await expectDayNumberContained(page, "2026-07-10");
				expect(await page.locator("[data-my-calendar]").evaluate((host) => host.scrollWidth - host.clientWidth)).toBeLessThanOrEqual(1);
				await page.keyboard.press("Enter");
				await expect(page.locator(".lfc-calendar-agenda-title")).toBeFocused();
				await expect(page.locator(".lfc-calendar-agenda-event").first()).toBeVisible();
			});
		}
	}
}

for (const width of [320, 358]) {
	for (const enlarged of [false, true]) {
		for (const rtl of [false, true]) {
			test(`navigation touch areas fit a ${String(width)}px ${rtl ? "RTL" : "LTR"} host at ${enlarged ? "200%" : "normal"} text`, async ({ page }) => {
				await mountCalendar(page, { count: 12, rtl, width });
				if (enlarged) {
					await page.evaluate(() => {
						const root = document.documentElement;
						root.style.fontSize = `${String(Number.parseFloat(getComputedStyle(root).fontSize) * 2)}px`;
					});
				}
				const navigation = page.getByRole("group", { name: "Calendar navigation", exact: true });
				const title = navigation.locator(".lfc-calendar-title-button");
				await expect(title).toHaveAccessibleName("Choose month and year, currently July 2026");
				await expect(title.locator(".lfc-calendar-title-label-compact")).toBeVisible();
				await expect(navigation.getByRole("button")).toHaveCount(4);
				const geometry = await navigation.evaluate((container) => {
					const rect = (element) => {
						const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
						return { left, top, right, bottom, width, height };
					};
					const titleButton = container.querySelector(".lfc-calendar-title-button");
					const visibleTitle = titleButton.querySelector(".lfc-calendar-title-label-compact");
					return {
						controls: [...container.querySelectorAll("button")].map((button) => ({
							...rect(button),
							name: button.getAttribute("aria-label") ?? button.textContent.trim()
						})),
						host: rect(container.closest(".litefold-calendar")),
						navigation: rect(container),
						title: rect(titleButton),
						visibleTitle: rect(visibleTitle),
						visibleTitleWidth: visibleTitle.clientWidth,
						visibleTitleScrollWidth: visibleTitle.scrollWidth
					};
				});
				expectRectInside(geometry.navigation, geometry.host, "navigation inside its host");
				for (const control of geometry.controls) {
					expect(control.width, `${control.name} target width`).toBeGreaterThanOrEqual(24);
					expect(control.height, `${control.name} target height`).toBeGreaterThanOrEqual(24);
					expectRectInside(control, geometry.navigation, `${control.name} inside navigation`);
				}
				for (let index = 0; index < geometry.controls.length; index += 1) {
					const left = geometry.controls[index];
					for (const right of geometry.controls.slice(index + 1)) {
						const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
						const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
						expect(overlapWidth <= 1 || overlapHeight <= 1, `${left.name} and ${right.name} touch areas do not overlap`).toBe(true);
					}
				}
				expectRectInside(geometry.visibleTitle, geometry.title, "visible month title inside its button");
				expect(geometry.visibleTitleWidth).toBeGreaterThan(0);
				expect(geometry.visibleTitleScrollWidth, "visible month title is not clipped").toBeLessThanOrEqual(geometry.visibleTitleWidth + 1);
			});
		}
	}
}

function expectRectInside(inner, outer, description) {
	const tolerance = 1;
	expect(inner.left, `${description}: left`).toBeGreaterThanOrEqual(outer.left - tolerance);
	expect(inner.top, `${description}: top`).toBeGreaterThanOrEqual(outer.top - tolerance);
	expect(inner.right, `${description}: right`).toBeLessThanOrEqual(outer.right + tolerance);
	expect(inner.bottom, `${description}: bottom`).toBeLessThanOrEqual(outer.bottom + tolerance);
}

async function expectDayNumberContained(page, date) {
	const number = page.locator(`.lfc-calendar-day-button[data-lfc-date="${date}"] .lfc-calendar-day-number`);
	await expect(number).toHaveText(String(Number(date.slice(-2))));
	const geometry = await number.evaluate((badge) => {
		const rect = (element) => {
			const { left, top, right, bottom } = element.getBoundingClientRect();
			return { left, top, right, bottom };
		};
		const range = document.createRange();
		range.selectNodeContents(badge);
		return {
			badge: rect(badge),
			cell: rect(badge.closest(".lfc-calendar-day")),
			lines: [...range.getClientRects()].map(({ left, top, right, bottom }) => ({ left, top, right, bottom }))
		};
	});
	expectRectInside(geometry.badge, geometry.cell, `${date} badge inside its day`);
	expect(geometry.lines.length).toBeGreaterThan(0);
	for (const line of geometry.lines) {
		//Text ranges include vertical font metrics beyond a line-height: 1 badge; the day owns clipping.
		expectRectInside(line, geometry.cell, `${date} text inside its day`);
		expect(line.left, `${date} text inside badge left`).toBeGreaterThanOrEqual(geometry.badge.left - 1);
		expect(line.right, `${date} text inside badge right`).toBeLessThanOrEqual(geometry.badge.right + 1);
	}
}

async function mountCalendar(page, settings = {}) {
	await page.setViewportSize({ width: 1200, height: 1200 });
	await expectLibraryFixtureReady(page);
	await page.evaluate(async (settings) => {
		const { createCalendar } = await import("/dist/index.js");
		const host = document.querySelector("[data-my-calendar]");
		host.style.inlineSize = `${String(settings.width ?? 320)}px`;
		if (settings.rtl) { host.dir = "rtl"; }
		const fixture = { errors: [], host, hooks: 0, requests: 0, titlePrefix: "Event" };
		const options = {
			events: () => {
				fixture.requests += 1;
				return Array.from({ length: settings.count ?? 2 }, (_, index) => ({
					id: `count-${String(index)}`,
					start: "2026-07-14T09:00",
					title: `${fixture.titlePrefix} ${String(index)}`
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
