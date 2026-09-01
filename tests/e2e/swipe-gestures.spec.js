import { expect, test } from "@playwright/test";

import { expectExampleReady } from "./helpers.js";

const HOST_SELECTOR = "[data-my-calendar]";
const MONTH_SELECTOR = "[data-my-state-month]";
const VIEWPORT_SELECTOR = ".lfc-calendar-swipe-viewport";
const WHEEL_BURST_MAXIMUM_SPAN_MILLISECONDS = 120;
const CHROMIUM_INPUT_REASON =
	"Trusted touch and pen injection uses Chromium CDP, which Playwright does not expose for Firefox or WebKit.";

async function createChromiumInputClient(page, reducedMotion) {
	const client = await page.context().newCDPSession(page);
	await client.send("Emulation.setTouchEmulationEnabled", {
		enabled: true,
		maxTouchPoints: 2
	});
	await page.emulateMedia({ reducedMotion });
	return client;
}

function skipWithoutChromiumInput(browserName) {
	test.skip(browserName !== "chromium", CHROMIUM_INPUT_REASON);
}

async function dispatchTouch(client, type, points) {
	await client.send("Input.dispatchTouchEvent", {
		touchPoints: points.map(({ id = 0, x, y }) => ({
			force: 1,
			id,
			radiusX: 1,
			radiusY: 1,
			x,
			y
		})),
		type
	});
}

async function dispatchPen(client, type, point, pressed) {
	await client.send("Input.dispatchMouseEvent", {
		button: type === "mouseMoved" ? "none" : "left",
		buttons: pressed ? 1 : 0,
		clickCount: type === "mouseMoved" ? 0 : 1,
		pointerType: "pen",
		type,
		x: point.x,
		y: point.y
	});
}

async function gesturePoint(locator, topInset = 48) {
	await locator.scrollIntoViewIfNeeded();
	const box = await locator.boundingBox();
	expect(box).not.toBeNull();
	return {
		x: Math.round((box?.x ?? 0) + ((box?.width ?? 0) / 2)),
		y: Math.round((box?.y ?? 0) + Math.min(topInset, (box?.height ?? 0) / 2))
	};
}

async function runTouchGesture(page, client, start, deltaX, deltaY, cancel = false) {
	await dispatchTouch(client, "touchStart", [start]);
	for (let step = 1; step <= 4; step += 1) {
		await dispatchTouch(client, "touchMove", [{
			x: start.x + ((deltaX * step) / 4),
			y: start.y + ((deltaY * step) / 4)
		}]);
		await page.waitForTimeout(20);
	}
	await dispatchTouch(client, cancel ? "touchCancel" : "touchEnd", []);
}

async function mountCalendarFixture(page, options = {}) {
	await page.evaluate(async (fixtureOptions) => {
		const { createCalendar } = await import("/dist/index.js");
		const fixture = document.createElement("section");
		fixture.id = "my-swipe-fixture";
		const toolbarAction = document.createElement("button");
		toolbarAction.className = "my-test-toolbar-action";
		toolbarAction.type = "button";
		toolbarAction.textContent = "Fixture action";
		const host = document.createElement("div");
		fixture.append(host);
		document.body.append(fixture);
		const observations = {
			destroyOnRequest: false,
			requests: [],
			selections: 0,
			toolbarActivations: 0
		};
		toolbarAction.addEventListener("click", () => { observations.toolbarActivations += 1; });
		let calendar;
		calendar = createCalendar(host, {
			events: ({ end, start }) => {
				observations.requests.push({ end, start });
				if (observations.destroyOnRequest) {
					calendar.destroy();
				}
				return [];
			},
			initialDate: "2026-08-06",
			...(fixtureOptions.maxDate === undefined ? {} : { maxDate: fixtureOptions.maxDate }),
			...(fixtureOptions.minDate === undefined ? {} : { minDate: fixtureOptions.minDate }),
			onDaySelect: () => { observations.selections += 1; },
			swipe: fixtureOptions.swipe ?? true,
			toolbarEnd: toolbarAction
		});
		calendar.render();
		Object.defineProperty(window, "__lfcSwipeFixture", {
			configurable: true,
			value: { calendar, host, observations, toolbarAction }
		});
	}, options);
	await expect.poll(() => page.evaluate(() =>
		window.__lfcSwipeFixture.calendar.getState().phase
	)).toBe("ready");
	return page.locator("#my-swipe-fixture > div");
}

async function readPagerMetrics(host) {
	return host.locator(VIEWPORT_SELECTOR).evaluate((viewport) => {
		const grid = viewport.querySelector(".lfc-calendar-grid");
		const previous = viewport.querySelector(".lfc-calendar-swipe-lane-previous");
		const next = viewport.querySelector(".lfc-calendar-swipe-lane-next");
		if (!(grid instanceof HTMLElement) || !(previous instanceof HTMLElement) ||
			!(next instanceof HTMLElement)) {
			throw new Error("Expected the native pager lanes and grid.");
		}
		const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
		const clamp = (value) => Math.max(0, Math.min(maximum, value));
		const gridStart = grid.offsetLeft;
		const laneTarget = (lane) => lane.offsetLeft < gridStart ? 0 : maximum;
		return {
			center: clamp(gridStart),
			clientWidth: viewport.clientWidth,
			maximum,
			next: laneTarget(next),
			previous: laneTarget(previous),
			scrollLeft: viewport.scrollLeft,
			scrollWidth: viewport.scrollWidth
		};
	});
}

async function setPagerPosition(
	host,
	destination,
	terminal = true,
	fraction = 1,
	wheelTimeIncrement = 121
) {
	await host.locator(VIEWPORT_SELECTOR).evaluate((viewport, options) => {
		const grid = viewport.querySelector(".lfc-calendar-grid");
		const lane = viewport.querySelector(
			`.lfc-calendar-swipe-lane-${options.destination}`
		);
		if (!(grid instanceof HTMLElement) || !(lane instanceof HTMLElement)) {
			throw new Error("Expected pager geometry.");
		}
		const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
		const clamp = (value) => Math.max(0, Math.min(maximum, value));
		const center = clamp(grid.offsetLeft);
		const target = lane.offsetLeft < grid.offsetLeft ? 0 : maximum;
		window.__lfcSyntheticWheelTime = (window.__lfcSyntheticWheelTime ?? 0) +
			options.wheelTimeIncrement;
		const wheel = new WheelEvent("wheel", { deltaX: 40, deltaY: 0 });
		Object.defineProperty(wheel, "timeStamp", { value: window.__lfcSyntheticWheelTime });
		viewport.dispatchEvent(wheel);
		viewport.scrollLeft = center + ((target - center) * options.fraction);
		viewport.dispatchEvent(new Event("scroll"));
		if (options.terminal) {
			viewport.dispatchEvent(new Event("scrollend"));
		}
	}, { destination, fraction, terminal, wheelTimeIncrement });
}

async function expectPagerClean(host) {
	await expect.poll(async () => {
		const metrics = await readPagerMetrics(host);
		return host.evaluate((element, pagerMetrics) => ({
			centered: Math.abs(pagerMetrics.scrollLeft - pagerMetrics.center) <= 1,
			gridCount: element.querySelectorAll(".lfc-calendar-grid").length,
			hasInlineStyle: element.matches("[style]") || element.querySelector("[style]") !== null,
			state: element.getAttribute("data-lfc-swipe-state")
		}), metrics);
	}).toEqual({ centered: true, gridCount: 1, hasInlineStyle: false, state: null });
}

function rangeLength(request) {
	return (Date.parse(`${request.end}T00:00:00.000Z`) -
		Date.parse(`${request.start}T00:00:00.000Z`)) / 86_400_000;
}

async function formatBrowserMonthTitle(page, monthIndex, month = "long") {
	return page.evaluate((options) => new Intl.DateTimeFormat("en-US", {
		calendar: "gregory",
		month: options.month,
		timeZone: "UTC",
		year: "numeric"
	}).format(new Date(Date.UTC(2026, options.monthIndex, 1))), {
		month,
		monthIndex
	});
}

function pagingLaneLabels(host, direction) {
	const lane = host.locator(`.lfc-calendar-swipe-lane-${direction}`);
	const wrapper = lane.locator(".lfc-calendar-swipe-lane-label");
	return {
		compact: wrapper.locator(":scope > .lfc-calendar-swipe-lane-label-compact"),
		full: wrapper.locator(":scope > .lfc-calendar-swipe-lane-label-full"),
		lane,
		wrapper
	};
}

test.describe("native month pager", () => {
	test.use({ reducedMotion: "no-preference" });

	test.beforeEach(async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
	});

	test("renders hidden semantic lanes around one live grid and settles the current snap", async ({ page }) => {
		const host = page.locator(HOST_SELECTOR);
		const viewport = host.locator(VIEWPORT_SELECTOR);
		await expect(host).toHaveAttribute("data-lfc-swipe-enabled", "true");
		const semantics = await host.evaluate((element) => {
			const pager = element.querySelector(".lfc-calendar-swipe-viewport");
			const previous = element.querySelector(".lfc-calendar-swipe-lane-previous");
			const next = element.querySelector(".lfc-calendar-swipe-lane-next");
			const grid = element.querySelector(".lfc-calendar-grid");
			if (!(pager instanceof HTMLElement) || !(previous instanceof HTMLElement) ||
				!(next instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
				throw new Error("Expected pager DOM.");
			}
			const laneSemantics = (lane) => {
				const wrapper = lane.querySelector(".lfc-calendar-swipe-lane-label");
				const full = wrapper?.querySelector(
					":scope > .lfc-calendar-swipe-lane-label-full"
				);
				const compact = wrapper?.querySelector(
					":scope > .lfc-calendar-swipe-lane-label-compact"
				);
				if (!(wrapper instanceof HTMLElement) || !(full instanceof HTMLElement) ||
					!(compact instanceof HTMLElement)) {
					throw new Error("Expected stable full and compact pager labels.");
				}
				return {
					ariaHidden: lane.getAttribute("aria-hidden"),
					available: lane.hasAttribute("data-lfc-page-available"),
					childClasses: [...wrapper.children].map((child) => child.className),
					compact: {
						text: compact.textContent,
						visible: getComputedStyle(compact).display !== "none"
					},
					full: {
						text: full.textContent,
						visible: getComputedStyle(full).display !== "none"
					},
					grids: lane.querySelectorAll("[role='grid']").length
				};
			};
			return {
				childClasses: [...pager.children].map((child) => child.className),
				dayCount: grid.querySelectorAll(".lfc-calendar-day").length,
				documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
				gridCount: pager.querySelectorAll("[role='grid']").length,
				gridRole: grid.getAttribute("role"),
				hasInlineStyle: element.matches("[style]") || element.querySelector("[style]") !== null,
				next: laneSemantics(next),
				previous: laneSemantics(previous),
				styles: {
					direction: getComputedStyle(pager).direction,
					scrollBehavior: getComputedStyle(pager).scrollBehavior,
					scrollSnapType: getComputedStyle(pager).scrollSnapType,
					touchAction: getComputedStyle(grid).touchAction
				},
				tabIndex: pager.tabIndex
			};
		});
		const julyFull = await formatBrowserMonthTitle(page, 6);
		const julyCompact = await formatBrowserMonthTitle(page, 6, "short");
		const septemberFull = await formatBrowserMonthTitle(page, 8);
		const septemberCompact = await formatBrowserMonthTitle(page, 8, "short");
		expect(semantics).toMatchObject({
			childClasses: [
				"lfc-calendar-swipe-lane lfc-calendar-swipe-lane-previous",
				"lfc-calendar-grid",
				"lfc-calendar-swipe-lane lfc-calendar-swipe-lane-next"
			],
			dayCount: 42,
			documentOverflow: 0,
			gridCount: 1,
			gridRole: "grid",
			hasInlineStyle: false,
			next: {
				ariaHidden: "true",
				available: true,
				childClasses: [
					"lfc-calendar-swipe-lane-label-full",
					"lfc-calendar-swipe-lane-label-compact"
				],
				compact: { text: septemberCompact, visible: false },
				full: { text: septemberFull, visible: true },
				grids: 0
			},
			previous: {
				ariaHidden: "true",
				available: true,
				childClasses: [
					"lfc-calendar-swipe-lane-label-full",
					"lfc-calendar-swipe-lane-label-compact"
				],
				compact: { text: julyCompact, visible: false },
				full: { text: julyFull, visible: true },
				grids: 0
			},
			styles: {
				direction: "ltr",
				scrollBehavior: "auto",
				scrollSnapType: "x mandatory",
				touchAction: "auto"
			},
			tabIndex: -1
		});
		expect((await readPagerMetrics(host)).maximum).toBeGreaterThan(0);
		await setPagerPosition(host, "next", true, 0.2);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
		await expectPagerClean(host);
		await expect(viewport).not.toHaveAttribute("aria-hidden");
	});

	test("scrollend requests one month while current and bounded snaps do not", async ({ page }) => {
		const host = await mountCalendarFixture(page, {
			maxDate: "2026-09-30",
			minDate: "2026-08-01"
		});
		const previousLabels = pagingLaneLabels(host, "previous");
		const nextLabels = pagingLaneLabels(host, "next");
		const augustFull = await formatBrowserMonthTitle(page, 7);
		const augustCompact = await formatBrowserMonthTitle(page, 7, "short");
		const septemberFull = await formatBrowserMonthTitle(page, 8);
		const septemberCompact = await formatBrowserMonthTitle(page, 8, "short");
		const initial = await page.evaluate(() => window.__lfcSwipeFixture.observations.requests);
		expect(initial).toHaveLength(1);
		expect(rangeLength(initial[0])).toBe(42);
		await expect(previousLabels.lane).toHaveAttribute("aria-hidden", "true");
		await expect(nextLabels.lane).toHaveAttribute("aria-hidden", "true");
		await expect(previousLabels.lane).not.toHaveAttribute("data-lfc-page-available");
		await expect(previousLabels.full).toHaveText("");
		await expect(previousLabels.compact).toHaveText("");
		await expect(nextLabels.full).toHaveText(septemberFull);
		await expect(nextLabels.compact).toHaveText(septemberCompact);
		expect(await page.evaluate(() => window.__lfcSwipeFixture.observations.requests.length))
			.toBe(1);

		await setPagerPosition(host, "next", true, 0.25);
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.observations.requests.length
		)).toBe(1);
		expect(await page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(8);

		await setPagerPosition(host, "next");
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		const afterNext = await page.evaluate(() => window.__lfcSwipeFixture.observations.requests);
		expect(afterNext).toHaveLength(2);
		expect(rangeLength(afterNext[1])).toBe(42);
		await expectPagerClean(host);
		await expect(nextLabels.lane).not.toHaveAttribute("data-lfc-page-available");
		await expect(nextLabels.full).toHaveText("");
		await expect(nextLabels.compact).toHaveText("");
		await expect(previousLabels.lane).toHaveAttribute("data-lfc-page-available", "");
		await expect(previousLabels.full).toHaveText(augustFull);
		await expect(previousLabels.compact).toHaveText(augustCompact);
		expect(await page.evaluate(() => window.__lfcSwipeFixture.observations.requests.length))
			.toBe(2);

		await setPagerPosition(host, "next");
		await expectPagerClean(host);
		expect(await page.evaluate(() => window.__lfcSwipeFixture.observations.requests.length)).toBe(2);

		await setPagerPosition(host, "previous");
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(8);
		const afterPrevious = await page.evaluate(() => window.__lfcSwipeFixture.observations.requests);
		expect(afterPrevious).toHaveLength(3);
		expect(rangeLength(afterPrevious[2])).toBe(42);
		await expectPagerClean(host);
		await expect(previousLabels.lane).not.toHaveAttribute("data-lfc-page-available");
		await expect(previousLabels.full).toHaveText("");
		await expect(previousLabels.compact).toHaveText("");
		await expect(nextLabels.lane).toHaveAttribute("data-lfc-page-available", "");
		await expect(nextLabels.full).toHaveText(septemberFull);
		await expect(nextLabels.compact).toHaveText(septemberCompact);
	});

	test("layout geometry remains exact through an ancestor transform and RTL recentering", async ({ page }) => {
		const host = await mountCalendarFixture(page);
		const ruleInstalled = await page.evaluate(() => {
			for (const sheet of document.styleSheets) {
				try {
					sheet.insertRule(
						"#my-swipe-fixture { transform: scale(.5); transform-origin: top left; }",
						sheet.cssRules.length
					);
					return true;
				} catch {
					//Try another same-origin stylesheet.
				}
			}
			return false;
		});
		expect(ruleInstalled).toBe(true);
		await page.evaluate(() => new Promise((resolve) => {
			requestAnimationFrame(() => { requestAnimationFrame(resolve); });
		}));
		const transformed = await host.locator(VIEWPORT_SELECTOR).evaluate((viewport) => {
			const grid = viewport.querySelector(".lfc-calendar-grid");
			if (!(grid instanceof HTMLElement)) {
				throw new Error("Expected pager grid.");
			}
			return {
				offsetParentIsViewport: grid.offsetParent === viewport,
				scale: viewport.getBoundingClientRect().width / viewport.offsetWidth
			};
		});
		expect(transformed.offsetParentIsViewport).toBe(true);
		expect(transformed.scale).toBeCloseTo(0.5, 2);

		await setPagerPosition(host, "next");
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		await expectPagerClean(host);
		await setPagerPosition(host, "previous");
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(8);
		await expectPagerClean(host);

		await host.evaluate((element) => { element.dir = "rtl"; });
		await page.evaluate(() => new Promise((resolve) => {
			requestAnimationFrame(() => { requestAnimationFrame(resolve); });
		}));
		const rtlMetrics = await readPagerMetrics(host);
		expect(rtlMetrics.next).toBeLessThan(rtlMetrics.center);
		expect(rtlMetrics.previous).toBeGreaterThan(rtlMetrics.center);
		await setPagerPosition(host, "next");
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		await expectPagerClean(host);
		await setPagerPosition(host, "previous");
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(8);
		await expectPagerClean(host);
		expect(await page.evaluate(() =>
			window.__lfcSwipeFixture.observations.requests.length
		)).toBe(5);
	});

	test("wheel burst timestamps remain one transaction across pager rerenders", async ({ page }) => {
		const host = await mountCalendarFixture(page);
		for (const wheelTimeIncrement of [WHEEL_BURST_MAXIMUM_SPAN_MILLISECONDS + 1, 10, 10]) {
			await setPagerPosition(host, "next", true, 1, wheelTimeIncrement);
			await expectPagerClean(host);
		}
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => ({
			month: window.__lfcSwipeFixture.calendar.getState().displayedMonth.month,
			requests: window.__lfcSwipeFixture.observations.requests.length
		}))).toEqual({ month: 9, requests: 2 });
		await expectPagerClean(host);
	});

	test("a trusted rapid three-event horizontal wheel burst commits exactly one page", async ({ page }) => {
		const host = await mountCalendarFixture(page);
		const point = await gesturePoint(host.locator(
			'.lfc-calendar-day-button[data-lfc-date="2026-08-13"]'
		), 16);
		await page.evaluate(() => {
			const burst = [];
			Object.defineProperty(window, "__lfcTrustedWheelBurst", {
				configurable: true,
				value: burst
			});
			document.addEventListener("wheel", (event) => {
				if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
					burst.push({
						isTrusted: event.isTrusted,
						timeStamp: event.timeStamp
					});
				}
			}, { capture: true, passive: true });
		});
		await page.mouse.move(point.x, point.y);
		for (let eventIndex = 0; eventIndex < 3; eventIndex += 1) {
			await page.mouse.wheel(90, 0);
		}

		await expect.poll(() => page.evaluate(() =>
			window.__lfcTrustedWheelBurst.length
		)).toBe(3);
		const trustedBurst = await page.evaluate(() => window.__lfcTrustedWheelBurst);
		expect(trustedBurst).toHaveLength(3);
		expect(trustedBurst.every((event) => event.isTrusted)).toBe(true);
		const maximumObservedGap = Math.max(
			...trustedBurst.slice(1).map((event, eventIndex) =>
				event.timeStamp - trustedBurst[eventIndex].timeStamp
			)
		);
		test.skip(
			maximumObservedGap > WHEEL_BURST_MAXIMUM_SPAN_MILLISECONDS,
			"The runner did not deliver the trusted wheel events within one burst window."
		);
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => ({
			month: window.__lfcSwipeFixture.calendar.getState().displayedMonth.month,
			requests: window.__lfcSwipeFixture.observations.requests.length
		}))).toEqual({ month: 9, requests: 2 });
		await expectPagerClean(host);
	});

	test("trusted touch returns short pulls, commits once in LTR and RTL, and stops at bounds", async ({ browserName, page }) => {
		skipWithoutChromiumInput(browserName);
		const client = await createChromiumInputClient(page, "no-preference");
		const host = page.locator(HOST_SELECTOR);
		const viewport = host.locator(VIEWPORT_SELECTOR);
		const actionResult = page.locator("[data-my-action-result]");
		const initialActionResult = await actionResult.textContent();
		let point = await gesturePoint(viewport);

		await runTouchGesture(page, client, point, -40, 0);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
		await expectPagerClean(host);
		await expect(actionResult).toHaveText(initialActionResult ?? "");

		point = await gesturePoint(viewport);
		await runTouchGesture(page, client, point, -120, 0);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-09-01");
		await expectPagerClean(host);
		await expect(actionResult).toHaveText(initialActionResult ?? "");

		await page.locator("[data-my-direction]").check();
		const rtlAction = await actionResult.textContent();
		point = await gesturePoint(viewport);
		await runTouchGesture(page, client, point, -120, 0);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
		await expectPagerClean(host);
		await expect(actionResult).toHaveText(rtlAction ?? "");

		point = await gesturePoint(viewport);
		await runTouchGesture(page, client, point, -120, 0);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-07-01");
		await expectPagerClean(host);
		await expect(actionResult).toHaveText(rtlAction ?? "");

		point = await gesturePoint(viewport);
		await runTouchGesture(page, client, point, -120, 0);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-07-01");
		await expectPagerClean(host);
		await expect(actionResult).toHaveText(rtlAction ?? "");
	});

	test("trusted vertical, multi-touch, and canceled gestures preserve the current month", async ({ browserName, page }) => {
		skipWithoutChromiumInput(browserName);
		const client = await createChromiumInputClient(page, "no-preference");
		const host = page.locator(HOST_SELECTOR);
		const viewport = host.locator(VIEWPORT_SELECTOR);
		const actionResult = page.locator("[data-my-action-result]");
		const initialActionResult = await actionResult.textContent();
		let point = await gesturePoint(viewport);
		const scrollStart = await page.evaluate(() => scrollY);
		await runTouchGesture(page, client, point, 4, -120);
		await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollStart);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
		await expectPagerClean(host);

		point = await gesturePoint(viewport);
		await dispatchTouch(client, "touchStart", [{ ...point, id: 0 }]);
		await dispatchTouch(client, "touchMove", [{ id: 0, x: point.x - 40, y: point.y }]);
		await page.waitForTimeout(30);
		await dispatchTouch(client, "touchStart", [
			{ id: 0, x: point.x - 40, y: point.y },
			{ id: 1, x: point.x + 20, y: point.y }
		]);
		await dispatchTouch(client, "touchEnd", []);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
		await expectPagerClean(host);

		point = await gesturePoint(viewport);
		await runTouchGesture(page, client, point, -120, 0, true);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
		await expectPagerClean(host);
		await expect(actionResult).toHaveText(initialActionResult ?? "");
	});

	test("trusted wheel pages horizontally and leaves vertical wheel unhandled", async ({ page }) => {
		const host = page.locator(HOST_SELECTOR);
		let point = await gesturePoint(page.locator(
			'.lfc-calendar-day-button[data-lfc-date="2026-08-13"]'
		), 16);
		await page.mouse.move(point.x, point.y);
		await page.mouse.wheel(200, 0);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-09-01");
		await expectPagerClean(host);

		const viewport = host.locator(VIEWPORT_SELECTOR);
		await viewport.evaluate((element) => {
			Object.defineProperty(window, "__lfcVerticalWheel", {
				configurable: true,
				value: null,
				writable: true
			});
			element.addEventListener("wheel", (event) => {
				if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
					window.__lfcVerticalWheel = {
						defaultPrevented: event.defaultPrevented,
						isTrusted: event.isTrusted
					};
				}
			}, { once: true });
		});
		point = await gesturePoint(page.locator(
			'.lfc-calendar-day-button[data-lfc-date="2026-09-10"]'
		), 16);
		await page.mouse.move(point.x, point.y);
		await page.mouse.wheel(0, 200);
		await expect.poll(() => page.evaluate(() => window.__lfcVerticalWheel)).toEqual({
			defaultPrevented: false,
			isTrusted: true
		});
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-09-01");
		await expectPagerClean(host);
	});

	test("trusted pen input is not intercepted", async ({ browserName, page }) => {
		skipWithoutChromiumInput(browserName);
		const client = await createChromiumInputClient(page, "no-preference");
		const host = await mountCalendarFixture(page);
		const viewport = host.locator(VIEWPORT_SELECTOR);

		await viewport.evaluate((element) => {
			const events = [];
			for (const type of ["pointerdown", "pointermove", "pointerup"]) {
				element.addEventListener(type, (event) => {
					if (event.pointerType === "pen") {
						events.push({
							defaultPrevented: event.defaultPrevented,
							hasCapture: element.hasPointerCapture(event.pointerId),
							isTrusted: event.isTrusted,
							type: event.type
						});
					}
				}, true);
			}
			Object.defineProperty(window, "__lfcPenEvents", { configurable: true, value: events });
		});
		const point = await gesturePoint(viewport, 16);
		await dispatchPen(client, "mouseMoved", point, false);
		await dispatchPen(client, "mousePressed", point, true);
		await dispatchPen(client, "mouseMoved", { x: point.x + 80, y: point.y }, true);
		await dispatchPen(client, "mouseReleased", { x: point.x + 80, y: point.y }, false);
		const penOutcome = await page.evaluate(() => ({
			events: window.__lfcPenEvents,
			hasInlineStyle: document.querySelector("[data-my-calendar]")?.matches("[style]") ||
				document.querySelector("[data-my-calendar] [style]") !== null
		}));
		expect(penOutcome.events.length).toBeGreaterThanOrEqual(3);
		expect(penOutcome.events.every((event) =>
			event.isTrusted && !event.defaultPrevented && !event.hasCapture
		)).toBe(true);
		expect(penOutcome.hasInlineStyle).toBe(false);
		await expect(page.locator(MONTH_SELECTOR)).toHaveText("2026-08-01");
	});

	test("held touch cannot double-navigate across refetch or programmatic navigation", async ({ browserName, page }) => {
		skipWithoutChromiumInput(browserName);
		const client = await createChromiumInputClient(page, "no-preference");
		const host = await mountCalendarFixture(page);
		const viewport = host.locator(VIEWPORT_SELECTOR);
		let point = await gesturePoint(viewport);

		await dispatchTouch(client, "touchStart", [point]);
		await dispatchTouch(client, "touchMove", [{ x: point.x - 40, y: point.y }]);
		await expect(host).toHaveAttribute("data-lfc-swipe-state", "scrolling");
		await host.locator(".my-test-toolbar-action").focus();
		await host.locator(".my-test-toolbar-action").press("Enter");
		expect(await page.evaluate(() =>
			window.__lfcSwipeFixture.observations.toolbarActivations
		)).toBe(1);
		await page.evaluate(() => { window.__lfcSwipeFixture.calendar.refetchEvents(); });
		await expectPagerClean(host);
		await dispatchTouch(client, "touchMove", [{ x: point.x - 100, y: point.y }]);
		await dispatchTouch(client, "touchEnd", []);
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(8);
		expect(await page.evaluate(() => window.__lfcSwipeFixture.observations)).toMatchObject({
			selections: 0,
			toolbarActivations: 1
		});

		point = await gesturePoint(viewport);
		await dispatchTouch(client, "touchStart", [point]);
		await dispatchTouch(client, "touchMove", [{ x: point.x - 40, y: point.y }]);
		await expect(host).toHaveAttribute("data-lfc-swipe-state", "scrolling");
		await page.evaluate(() => { window.__lfcSwipeFixture.calendar.next(); });
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		await dispatchTouch(client, "touchMove", [{ x: point.x - 100, y: point.y }]);
		await dispatchTouch(client, "touchEnd", []);
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => ({
			month: window.__lfcSwipeFixture.calendar.getState().displayedMonth.month,
			requests: window.__lfcSwipeFixture.observations.requests.length,
			selections: window.__lfcSwipeFixture.observations.selections
		}))).toEqual({ month: 9, requests: 3, selections: 0 });
		await expectPagerClean(host);
	});

	test("swipe false hides lanes and ignores trusted wheel paging", async ({ page }) => {
		const host = await mountCalendarFixture(page, { swipe: false });
		const viewport = host.locator(VIEWPORT_SELECTOR);
		await expect(host).not.toHaveAttribute("data-lfc-swipe-enabled");
		const disabled = await host.evaluate((element) => {
			const pager = element.querySelector(".lfc-calendar-swipe-viewport");
			const lanes = [...element.querySelectorAll(".lfc-calendar-swipe-lane")];
			if (!(pager instanceof HTMLElement)) {
				throw new Error("Expected disabled pager viewport.");
			}
			return {
				availableLanes: lanes.filter((lane) => lane.hasAttribute("data-lfc-page-available")).length,
				displays: lanes.map((lane) => getComputedStyle(lane).display),
				scrollLeft: pager.scrollLeft,
				scrollSnapType: getComputedStyle(pager).scrollSnapType,
				scrollWidthDelta: pager.scrollWidth - pager.clientWidth
			};
		});
		expect(disabled).toEqual({
			availableLanes: 0,
			displays: ["none", "none"],
			scrollLeft: 0,
			scrollSnapType: "none",
			scrollWidthDelta: 0
		});
		const point = await gesturePoint(viewport);
		await page.mouse.move(point.x, point.y);
		await page.mouse.wheel(250, 0);
		await page.waitForTimeout(200);
		expect(await page.evaluate(() => ({
			month: window.__lfcSwipeFixture.calendar.getState().displayedMonth.month,
			requests: window.__lfcSwipeFixture.observations.requests.length,
			state: window.__lfcSwipeFixture.host.getAttribute("data-lfc-swipe-state")
		}))).toEqual({ month: 8, requests: 1, state: null });
	});

	test("swipe false ignores trusted touch paging", async ({ browserName, page }) => {
		skipWithoutChromiumInput(browserName);
		const client = await createChromiumInputClient(page, "no-preference");
		const host = await mountCalendarFixture(page, { swipe: false });
		const point = await gesturePoint(host.locator(VIEWPORT_SELECTOR));
		await runTouchGesture(page, client, point, -120, 0);
		await page.waitForTimeout(200);
		expect(await page.evaluate(() => ({
			month: window.__lfcSwipeFixture.calendar.getState().displayedMonth.month,
			requests: window.__lfcSwipeFixture.observations.requests.length,
			state: window.__lfcSwipeFixture.host.getAttribute("data-lfc-swipe-state")
		}))).toEqual({ month: 8, requests: 1, state: null });
	});
});

test.describe("native pager with reduced motion", () => {
	test.use({ reducedMotion: "reduce" });

	test("tracks directly and has no post-terminal snap interpolation or authored animation", async ({ browserName, page }) => {
		skipWithoutChromiumInput(browserName);
		await expectExampleReady(page, "/examples/advanced/");
		const client = await createChromiumInputClient(page, "reduce");
		const host = await mountCalendarFixture(page);
		const viewport = host.locator(VIEWPORT_SELECTOR);
		expect(await page.evaluate(() => ({
			noPreference: matchMedia("(prefers-reduced-motion: no-preference)").matches,
			reduce: matchMedia("(prefers-reduced-motion: reduce)").matches
		}))).toEqual({ noPreference: false, reduce: true });
		await expect(viewport).toHaveCSS("scroll-snap-type", "none");
		await viewport.evaluate((element) => {
			const snapshots = [];
			element.addEventListener("scrollend", () => {
				const first = element.scrollLeft;
				requestAnimationFrame(() => {
					const second = element.scrollLeft;
					requestAnimationFrame(() => {
						snapshots.push({ first, second, third: element.scrollLeft });
					});
				});
			});
			Object.defineProperty(window, "__lfcReducedSnapshots", {
				configurable: true,
				value: snapshots
			});
		});
		const startMetrics = await readPagerMetrics(host);
		const point = await gesturePoint(viewport);
		await dispatchTouch(client, "touchStart", [point]);
		for (let step = 1; step <= 4; step += 1) {
			await dispatchTouch(client, "touchMove", [{
				x: point.x - (30 * step),
				y: point.y
			}]);
			await page.waitForTimeout(20);
		}
		await expect.poll(async () => Math.abs(
			(await readPagerMetrics(host)).scrollLeft - startMetrics.center
		)).toBeGreaterThan(20);
		await dispatchTouch(client, "touchEnd", []);
		await expect.poll(() => page.evaluate(() =>
			window.__lfcSwipeFixture.calendar.getState().displayedMonth.month
		)).toBe(9);
		await expectPagerClean(host);
		await expect.poll(() => page.evaluate(() => window.__lfcReducedSnapshots.length))
			.toBeGreaterThan(0);
		const reducedOutcome = await host.evaluate((element) => ({
			animations: [
				element.querySelector(".lfc-calendar-swipe-viewport"),
				element.querySelector(".lfc-calendar-grid"),
				element.querySelector(".lfc-calendar-title-label")
			].filter((region) => region instanceof HTMLElement)
				.flatMap((region) => region.getAnimations()).length,
			hasInlineStyle: element.matches("[style]") || element.querySelector("[style]") !== null,
			snapshots: window.__lfcReducedSnapshots
		}));
		expect(reducedOutcome.animations).toBe(0);
		expect(reducedOutcome.hasInlineStyle).toBe(false);
		for (const snapshot of reducedOutcome.snapshots) {
			expect(Math.max(snapshot.first, snapshot.second, snapshot.third) -
				Math.min(snapshot.first, snapshot.second, snapshot.third)).toBeLessThanOrEqual(1);
		}
	});
});
