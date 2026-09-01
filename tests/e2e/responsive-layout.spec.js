import { expect, test } from "@playwright/test";

import {
	expectExampleReady,
	gridEventActions
} from "./helpers.js";

const COMPACT_VIEWPORT_HEIGHT = 1_100;
const COMPACT_ROW_MINIMUM = 60;
const COMPACT_ROW_MAXIMUM = 112;
const PRIMARY_TARGET_MINIMUM = 44;
const GRID_TARGET_MINIMUM = 24;
const REFLOW_ROOT_FONT_SIZE = 32;
const RESPONSIVE_MULTIPLE_EVENT_FIXTURE = "#my-responsive-multiple-event-fixture";
const RESPONSIVE_SINGLETON_EVENT_DATE = "2026-08-05";
const WEEK_LAYOUT_ANCHOR_DATE = "2026-08-04";
const WEEK_LAYOUT_FIXTURE = "#my-week-layout-fixture";
const WEEK_LAYOUT_TARGET_DATE = "2026-08-06";
const SEPTEMBER_TITLE = "September 2026";
const SEPTEMBER_TITLE_BUTTON_LABEL =
	"Choose schedule month and year, currently September 2026";
const LONG_MONTH_TITLE =
	"September in the exceptionally verbose regional calendar for the year 2026";
const LONG_COMPACT_MONTH_TITLE =
	"Sep in the exceptionally verbose regional calendar 2026";
const LONG_MONTH_TITLE_BUTTON_LABEL =
	`Choose schedule month and year, currently ${LONG_MONTH_TITLE}`;
const EXACT_HOST_WIDTH_CASES = Object.freeze([
	{ abbreviatedMonthLabels: true, agendaReflows: true, compactEvents: true, narrowWeekdays: true, toolbarLayout: "three-row", width: 280 },
	{ abbreviatedMonthLabels: true, agendaReflows: true, compactEvents: true, narrowWeekdays: true, toolbarLayout: "three-row", width: 320 },
	{ abbreviatedMonthLabels: true, agendaReflows: true, compactEvents: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 328 },
	{ abbreviatedMonthLabels: true, agendaReflows: true, compactEvents: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 340 },
	{ abbreviatedMonthLabels: true, agendaReflows: true, compactEvents: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 360 },
	{ abbreviatedMonthLabels: true, agendaReflows: true, compactEvents: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 375 },
	{ abbreviatedMonthLabels: false, agendaReflows: false, compactEvents: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 390 },
	{ abbreviatedMonthLabels: false, agendaReflows: false, compactEvents: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 412 },
	{ abbreviatedMonthLabels: false, agendaReflows: false, compactEvents: false, narrowWeekdays: false, toolbarLayout: "wide", width: 768 }
]);

test.use({ bypassCSP: true });

async function expectNoHorizontalOverflow(page) {
	const overflow = await page.evaluate(() => {
		const host = document.querySelector("[data-my-calendar]");
		const toolbar = document.querySelector(".lfc-calendar-toolbar");
		if (!(host instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) {
			throw new Error("Expected the rendered calendar and toolbar.");
		}
		return {
			document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			host: host.scrollWidth - host.clientWidth,
			toolbar: toolbar.scrollWidth - toolbar.clientWidth
		};
	});

	expect(overflow.document).toBeLessThanOrEqual(1);
	expect(overflow.host).toBeLessThanOrEqual(1);
	expect(overflow.toolbar).toBeLessThanOrEqual(1);
}

async function withMediaContextPage(browser, baseURL, media, callback) {
	if (typeof baseURL !== "string") {
		throw new Error("Responsive browser coverage requires a base URL.");
	}
	const context = await browser.newContext({
		baseURL,
		colorScheme: "light",
		locale: "en-US",
		reducedMotion: "reduce",
		timezoneId: "America/Los_Angeles",
		...media
	});
	const page = await context.newPage();
	try {
		await callback(page);
	} finally {
		await context.close();
	}
}

async function setExactCalendarHostWidth(page, width) {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.addStyleTag({
		content: `.my-calendar { inline-size: ${String(width)}px; justify-self: start; }`
	});
	const renderedWidth = await page.locator("[data-my-calendar]").evaluate((host) =>
		host.getBoundingClientRect().width
	);
	expect(renderedWidth).toBe(width);
}

async function setExactCalendarContentWidth(host, width) {
	const metrics = await host.evaluate(async (element, targetWidth) => {
		const initialStyle = getComputedStyle(element);
		const inlineInsets = [
			initialStyle.borderLeftWidth,
			initialStyle.borderRightWidth,
			initialStyle.paddingLeft,
			initialStyle.paddingRight
		].reduce((total, value) => total + Number.parseFloat(value), 0);
		element.style.inlineSize = `${String(
			initialStyle.boxSizing === "border-box" ? targetWidth + inlineInsets : targetWidth
		)}px`;
		await new Promise((resolve) => {
			requestAnimationFrame(() => { requestAnimationFrame(resolve); });
		});
		const renderedStyle = getComputedStyle(element);
		const renderedInsets = [
			renderedStyle.borderLeftWidth,
			renderedStyle.borderRightWidth,
			renderedStyle.paddingLeft,
			renderedStyle.paddingRight
		].reduce((total, value) => total + Number.parseFloat(value), 0);
		return {
			borderBoxWidth: element.getBoundingClientRect().width,
			boxSizing: renderedStyle.boxSizing,
			contentWidth: element.getBoundingClientRect().width - renderedInsets,
			inlineInsets: renderedInsets
		};
	}, width);
	expect(metrics.boxSizing).toBe("border-box");
	expect(metrics.inlineInsets).toBeGreaterThan(0);
	expect(Math.abs(metrics.contentWidth - width)).toBeLessThanOrEqual(0.1);
	expect(Math.abs(metrics.borderBoxWidth - (width + metrics.inlineInsets)))
		.toBeLessThanOrEqual(0.1);
}

async function expectToolbarDomAndFocusOrder(page) {
	const toolbarOrder = await page.locator(".lfc-calendar-toolbar").evaluate((toolbar) => {
		const selectors = [
			".lfc-calendar-nav-button-previous",
			".lfc-calendar-nav-button-next",
			".lfc-calendar-title-button",
			".lfc-calendar-today-button",
			".lfc-calendar-toolbar-end input"
		];
		const controls = selectors.map((selector) => toolbar.querySelector(selector));
		if (controls.some((control) => !(control instanceof HTMLElement))) {
			throw new Error("Expected every toolbar focus stop.");
		}
		return controls.slice(0, -1).every((control, index) => Boolean(
			control?.compareDocumentPosition(controls[index + 1]) &
				Node.DOCUMENT_POSITION_FOLLOWING
		));
	});
	expect(toolbarOrder).toBe(true);

	await expect(page.locator(".lfc-calendar-month-stepper > button")).toHaveCount(2);
	const controls = [
		page.locator(".lfc-calendar-nav-button-previous"),
		page.locator(".lfc-calendar-nav-button-next"),
		page.locator(".lfc-calendar-title-button"),
		page.locator(".lfc-calendar-today-button"),
		page.locator("[data-my-toolbar-end] input").first()
	];
	await controls[0].focus();
	for (let index = 1; index < controls.length; index += 1) {
		await page.keyboard.press("Tab");
		await expect(controls[index]).toBeFocused();
	}
}

async function expectTargetMinimums(page) {
	const primaryControls = [
		page.locator(".lfc-calendar-title-button"),
		page.locator(".lfc-calendar-nav-button-previous"),
		page.locator(".lfc-calendar-nav-button-next"),
		page.locator(".lfc-calendar-today-button")
	];
	for (const control of primaryControls) {
		const box = await control.boundingBox();
		expect(box).not.toBeNull();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(PRIMARY_TARGET_MINIMUM);
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(PRIMARY_TARGET_MINIMUM);
	}

	const eventBox = await gridEventActions(page).first().boundingBox();
	expect(eventBox).not.toBeNull();
	expect(eventBox?.height ?? 0).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
	expect(eventBox?.width ?? 0).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
}

async function formatBrowserMonthTitle(
	page,
	{
		locale = "en-US",
		month = "short",
		monthIndex = 8,
		year = 2026
	} = {}
) {
	return page.evaluate((options) => new Intl.DateTimeFormat(options.locale, {
		calendar: "gregory",
		month: options.month,
		timeZone: "UTC",
		year: "numeric"
	}).format(new Date(Date.UTC(options.year, options.monthIndex, 1))), {
		locale,
		month,
		monthIndex,
		year
	});
}

async function expectResponsiveMonthLabels(
	page,
	host,
	{
		abbreviated,
		locale = "en-US",
		monthIndex = 7,
		year = 2026
	}
) {
	const titleFull = host.locator(".lfc-calendar-title-label-full");
	const titleCompact = host.locator(".lfc-calendar-title-label-compact");
	const expectedTitleFull = await formatBrowserMonthTitle(page, {
		locale,
		month: "long",
		monthIndex,
		year
	});
	const expectedTitleCompact = await formatBrowserMonthTitle(page, {
		locale,
		monthIndex,
		year
	});
	await expect(titleFull).toHaveText(expectedTitleFull);
	await expect(titleCompact).toHaveAttribute("aria-hidden", "true");
	await expect(titleCompact).toHaveAttribute(
		"data-lfc-compact-title",
		expectedTitleCompact
	);
	const titleButton = host.locator(".lfc-calendar-title-button");
	const titleButtonLabel = await titleButton.getAttribute("aria-label");
	expect(titleButtonLabel).not.toBeNull();
	expect(titleButtonLabel).toContain(expectedTitleFull);
	await expect(host.getByRole("grid")).toHaveAccessibleName(expectedTitleFull);

	if (abbreviated) {
		await expect(titleFull).toHaveCSS("position", "absolute");
		await expect(titleFull).toHaveCSS("clip-path", "inset(50%)");
		await expect(titleCompact).toBeVisible();
	} else {
		await expect(titleFull).toBeVisible();
		await expect(titleFull).toHaveCSS("position", "static");
		await expect(titleCompact).toBeHidden();
	}

	for (const { direction, targetMonthIndex } of [
		{ direction: "previous", targetMonthIndex: monthIndex - 1 },
		{ direction: "next", targetMonthIndex: monthIndex + 1 }
	]) {
		const lane = host.locator(`.lfc-calendar-swipe-lane-${direction}`);
		const laneFull = lane.locator(".lfc-calendar-swipe-lane-label-full");
		const laneCompact = lane.locator(".lfc-calendar-swipe-lane-label-compact");
		const expectedFull = await formatBrowserMonthTitle(page, {
			locale,
			month: "long",
			monthIndex: targetMonthIndex,
			year
		});
		const expectedCompact = await formatBrowserMonthTitle(page, {
			locale,
			monthIndex: targetMonthIndex,
			year
		});
		await expect(lane).toHaveAttribute("aria-hidden", "true");
		await expect(laneFull).toHaveText(expectedFull);
		await expect(laneCompact).toHaveText(expectedCompact);
		await expect(laneFull).toHaveCount(1);
		await expect(laneCompact).toHaveCount(1);
		if (abbreviated) {
			await expect(laneFull).toBeHidden();
			await expect(laneCompact).toBeVisible();
		} else {
			await expect(laneFull).toBeVisible();
			await expect(laneCompact).toBeHidden();
		}
	}
}

async function showSeptember(page) {
	const compactTitle = await formatBrowserMonthTitle(page);
	await page.getByRole("button", { name: "Later month" }).click();
	await expect(page.locator("[data-my-calendar]")).not.toHaveAttribute("aria-busy", "true");
	await expect(page.locator(".lfc-calendar-title-label-full")).toHaveText(SEPTEMBER_TITLE);
	await expect(page.locator(".lfc-calendar-title-label-compact"))
		.toHaveAttribute("data-lfc-compact-title", compactTitle);
}

async function expectActiveMonthTitleNotToOverflow(host) {
	const metrics = await host.locator(".lfc-calendar-title-label").evaluate((wrapper) => {
		const full = wrapper.querySelector(".lfc-calendar-title-label-full");
		const compact = wrapper.querySelector(".lfc-calendar-title-label-compact");
		if (!(full instanceof HTMLElement) || !(compact instanceof HTMLElement)) {
			throw new Error("Expected stable full and compact title labels.");
		}
		const active = getComputedStyle(compact).display === "none" ? full : compact;
		const style = getComputedStyle(active);
		return {
			clientWidth: active.clientWidth,
			height: active.getBoundingClientRect().height,
			lineHeight: Number.parseFloat(style.lineHeight),
			scrollWidth: active.scrollWidth,
			whiteSpace: style.whiteSpace
		};
	});
	expect(metrics.clientWidth).toBeGreaterThan(0);
	expect(metrics.scrollWidth - metrics.clientWidth).toBeLessThanOrEqual(1);
	expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
	expect(metrics.whiteSpace).toBe("nowrap");
}

async function expectSingleLineMonthTitle(
	page,
	{
		buttonLabel = SEPTEMBER_TITLE_BUTTON_LABEL,
		compactTitle,
		overflowExpected = false,
		title = SEPTEMBER_TITLE
	} = {}
) {
	const expectedCompactTitle = compactTitle ?? await formatBrowserMonthTitle(page);
	const titleLabelFull = page.locator(".lfc-calendar-title-label-full");
	const titleLabelCompact = page.locator(".lfc-calendar-title-label-compact");
	await expect(titleLabelFull).toHaveText(title);
	await expect(titleLabelCompact).toHaveText("");
	await expect(titleLabelCompact).toHaveAttribute("aria-hidden", "true");
	await expect(titleLabelCompact).toHaveAttribute(
		"data-lfc-compact-title",
		expectedCompactTitle
	);

	await expect(page.locator(".lfc-calendar-title-button")).toHaveAttribute(
		"aria-label",
		buttonLabel
	);
	await expect(page.locator(".lfc-calendar-title-button")).toHaveAccessibleName(buttonLabel);
	await expect(page.getByRole("grid")).toHaveAccessibleName(title);

	const metrics = await titleLabelFull.evaluate((fullTitleLabel) => {
		const wrapper = fullTitleLabel.closest(".lfc-calendar-title-label");
		if (!(wrapper instanceof HTMLElement)) {
			throw new Error("Expected the visible title label wrapper.");
		}
		const compactTitleLabel = wrapper.querySelector(".lfc-calendar-title-label-compact");
		if (!(compactTitleLabel instanceof HTMLElement)) {
			throw new Error("Expected title labels.");
		}
		const compactVisible = getComputedStyle(compactTitleLabel).display !== "none";
		const activeTitle = compactVisible ? compactTitleLabel : fullTitleLabel;
		const style = getComputedStyle(activeTitle);
		const rect = activeTitle.getBoundingClientRect();
		return {
			activeText: compactVisible
				? compactTitleLabel.getAttribute("data-lfc-compact-title") ?? ""
				: fullTitleLabel.textContent ?? "",
			clientWidth: activeTitle.clientWidth,
			compactVisible,
			height: rect.height,
			lineHeight: Number.parseFloat(style.lineHeight),
			overflowX: style.overflowX,
			pseudoContent: compactVisible
				? getComputedStyle(compactTitleLabel, "::before").content
				: "none",
			scrollWidth: activeTitle.scrollWidth,
			textOverflow: style.textOverflow,
			textWrap: style.textWrap,
			whiteSpace: style.whiteSpace
		};
	});
	expect(metrics.activeText).toBe(metrics.compactVisible ? expectedCompactTitle : title);
	expect(metrics.clientWidth).toBeGreaterThan(0);
	expect(metrics.lineHeight).toBeGreaterThan(0);
	expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
	expect(metrics.textWrap).toBe("nowrap");
	expect(metrics.whiteSpace).toBe("nowrap");
	if (metrics.compactVisible) {
		expect(
			metrics.pseudoContent.includes(expectedCompactTitle) ||
			metrics.pseudoContent === "attr(data-lfc-compact-title)"
		).toBe(true);
	}
	if (overflowExpected) {
		expect(metrics.scrollWidth - metrics.clientWidth).toBeGreaterThan(1);
		expect(metrics.overflowX).toBe("hidden");
		expect(metrics.textOverflow).toBe("ellipsis");
	} else {
		expect(metrics.scrollWidth - metrics.clientWidth).toBeLessThanOrEqual(1);
	}
}

async function setLongMonthTitle(page) {
	await page.locator(".lfc-calendar-title-label").evaluate((titleLabel, titles) => {
		const fullTitle = titleLabel.querySelector(".lfc-calendar-title-label-full");
		const compactTitle = titleLabel.querySelector(".lfc-calendar-title-label-compact");
		if (!(fullTitle instanceof HTMLElement) || !(compactTitle instanceof HTMLElement)) {
			throw new Error("Expected both month title presentations.");
		}
		fullTitle.textContent = titles.full;
		compactTitle.setAttribute("data-lfc-compact-title", titles.compact);
		const titleButton = titleLabel.closest(".lfc-calendar-title-button");
		if (!(titleButton instanceof HTMLButtonElement)) {
			throw new Error("Expected the month title button.");
		}
		titleButton.setAttribute(
			"aria-label",
			`Choose schedule month and year, currently ${titles.full}`
		);
	}, { compact: LONG_COMPACT_MONTH_TITLE, full: LONG_MONTH_TITLE });
}

async function expectCompactToolbarVisualLayout(page, layout) {
	const positions = await page.locator(".lfc-calendar-toolbar").evaluate((toolbar) => {
		const selectors = {
			next: ".lfc-calendar-nav-button-next",
			previous: ".lfc-calendar-nav-button-previous",
			title: ".lfc-calendar-title-button",
			today: ".lfc-calendar-today-button",
			toolbarEnd: ".lfc-calendar-toolbar-end"
		};
		return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
			const element = toolbar.querySelector(selector);
			if (!(element instanceof HTMLElement)) {
				throw new Error(`Missing toolbar element: ${selector}`);
			}
			const box = element.getBoundingClientRect();
			return [name, {
				bottom: box.bottom,
				center: box.top + (box.height / 2),
				top: box.top
			}];
		}));
	});

	if (layout === "two-row") {
		for (const control of [positions.title, positions.previous, positions.next]) {
			expect(Math.abs(control.center - positions.today.center)).toBeLessThanOrEqual(1);
		}
		expect(positions.toolbarEnd.top).toBeGreaterThanOrEqual(Math.max(
			positions.today.bottom,
			positions.title.bottom,
			positions.previous.bottom,
			positions.next.bottom
		));
		return;
	}

	expect(layout).toBe("three-row");
	for (const control of [positions.title, positions.previous, positions.next]) {
		expect(Math.abs(control.center - positions.title.center)).toBeLessThanOrEqual(1);
	}
	expect(Math.abs(positions.next.center - positions.previous.center)).toBeLessThanOrEqual(1);
	expect(positions.today.top).toBeGreaterThanOrEqual(
		Math.max(positions.previous.bottom, positions.next.bottom, positions.title.bottom)
	);
	expect(positions.toolbarEnd.top).toBeGreaterThanOrEqual(
		positions.today.bottom
	);
}

async function prepareWeekLayoutFixturePage(page) {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	await expectExampleReady(page, "/examples/advanced/");
}

async function mountWeekLayoutFixture(
	page,
	{
		gridEventPlacement = null,
		weekRowSizing = null,
		width = 768
	} = {}
) {
	await page.evaluate(async (fixtureOptions) => {
		const current = window.__lfcWeekLayoutFixture;
		current?.calendar.destroy();
		current?.fixture.remove();

		const { createCalendar } = await import("/dist/index.js");
		const fixture = document.createElement("section");
		fixture.id = "my-week-layout-fixture";
		fixture.style.inlineSize = "fit-content";
		const host = document.createElement("div");
		host.dataset["testWeekLayoutHost"] = "";
		host.style.inlineSize = `${String(fixtureOptions.width)}px`;
		fixture.append(host);
		document.body.prepend(fixture);

		const targetEvents = Array.from({ length: 4 }, (_value, index) => ({
			id: `week-layout-target-${String(index + 1)}`,
			start: `2026-08-06T${String(9 + index).padStart(2, "0")}:00`,
			title: `Week layout target ${String(index + 1)}`
		}));
		const options = {
			events: [{
				id: "week-layout-anchor",
				start: "2026-08-04T08:00",
				title: "Tall intrinsic layout anchor"
			}, ...targetEvents],
			initialDate: fixtureOptions.targetDate,
			maxGridEventsPerDay: 2,
			onDaySelect: () => {},
			onEventActivate: () => {},
			renderHooks: [{
				id: "my-week-layout-fixture",
				dayDidMount: (context) => {
					if (context.dateString === fixtureOptions.anchorDate) {
						context.elements.cell.style.setProperty(
							"--lfc-grid-event-min-block-size",
							"9rem"
						);
					}
				},
				renderEventMarker: (context) => {
					const marker = context.document.createElement("span");
					marker.setAttribute("aria-hidden", "true");
					marker.style.background = "currentcolor";
					marker.style.borderRadius = "999px";
					marker.style.display = "block";
					marker.style.inlineSize = "0.75rem";
					marker.style.blockSize = context.surface === "grid-summary" &&
						context.event.id === "week-layout-anchor" ? "8rem" : "0.75rem";
					if (context.surface === "grid-summary" &&
						context.event.id === "week-layout-anchor") {
						marker.className = "my-week-layout-anchor";
					}
					return marker;
				},
				renderDayBadge: (context) => {
					if (context.dateString !== fixtureOptions.targetDate) {
						return undefined;
					}
					const badge = context.document.createElement("span");
					badge.dataset["testWeekLayoutBadge"] = "";
					badge.textContent = "Target badge";
					return badge;
				}
			}]
		};
		if (fixtureOptions.gridEventPlacement !== null) {
			options.gridEventPlacement = fixtureOptions.gridEventPlacement;
		}
		if (fixtureOptions.weekRowSizing !== null) {
			options.weekRowSizing = fixtureOptions.weekRowSizing;
		}

		const calendar = createCalendar(host, options);
		calendar.render();
		Object.defineProperty(window, "__lfcWeekLayoutFixture", {
			configurable: true,
			value: { calendar, fixture, host }
		});
	}, {
		anchorDate: WEEK_LAYOUT_ANCHOR_DATE,
		gridEventPlacement,
		targetDate: WEEK_LAYOUT_TARGET_DATE,
		weekRowSizing,
		width
	});
	await expect.poll(() => page.evaluate(() =>
		window.__lfcWeekLayoutFixture.calendar.getState().phase
	)).toBe("ready");
	return weekLayoutFixture(page);
}

function weekLayoutFixture(page) {
	const fixture = page.locator(WEEK_LAYOUT_FIXTURE);
	const host = fixture.locator("[data-test-week-layout-host]");
	return {
		anchorDay: host.locator(
			`.lfc-calendar-day:has(> .lfc-calendar-day-button[data-lfc-date="${WEEK_LAYOUT_ANCHOR_DATE}"])`
		),
		fixture,
		host,
		targetDay: host.locator(
			`.lfc-calendar-day:has(> .lfc-calendar-day-button[data-lfc-date="${WEEK_LAYOUT_TARGET_DATE}"])`
		),
		weeks: host.locator(".lfc-calendar-weeks")
	};
}

async function setWeekLayoutFixtureWidth(page, width) {
	const { host } = weekLayoutFixture(page);
	await host.evaluate((element, nextWidth) => {
		element.style.inlineSize = `${String(nextWidth)}px`;
	}, width);
	await page.evaluate(async () => new Promise((resolve) => {
		requestAnimationFrame(() => { requestAnimationFrame(resolve); });
	}));
}

async function getWeekLayoutGeometry(host) {
	return host.evaluate((element, dates) => {
		const weeksElement = element.querySelector(".lfc-calendar-weeks");
		const weeks = [...element.querySelectorAll(".lfc-calendar-week")];
		const targetButton = element.querySelector(
			`.lfc-calendar-day-button[data-lfc-date="${dates.target}"]`
		);
		const anchorButton = element.querySelector(
			`.lfc-calendar-day-button[data-lfc-date="${dates.anchor}"]`
		);
		const targetDay = targetButton?.closest(".lfc-calendar-day");
		const anchorDay = anchorButton?.closest(".lfc-calendar-day");
		const dateNumber = targetDay?.querySelector(".lfc-calendar-day-number");
		const badge = targetDay?.querySelector(".lfc-calendar-day-badge");
		const summaries = targetDay?.querySelector(".lfc-calendar-day-summaries");
		const anchorMarker = anchorDay?.querySelector(".my-week-layout-anchor");
		const anchorSummary = anchorMarker?.closest(".lfc-calendar-event-summary");
		if (!(weeksElement instanceof HTMLElement) ||
			!(targetDay instanceof HTMLElement) || !(anchorDay instanceof HTMLElement) ||
			!(dateNumber instanceof HTMLElement) || !(badge instanceof HTMLElement) ||
			!(summaries instanceof HTMLElement) || !(anchorSummary instanceof HTMLElement)) {
			throw new Error("Expected the complete week-layout fixture.");
		}

		const rootCandidates = [...summaries.children].flatMap((child) =>
			child instanceof HTMLElement && getComputedStyle(child).display === "contents"
				? [...child.children]
				: [child]
		);
		const visibleRoots = rootCandidates.filter((child) => {
			if (!(child instanceof HTMLElement)) {
				return false;
			}
			const style = getComputedStyle(child);
			const box = child.getBoundingClientRect();
			return style.display !== "none" && style.visibility !== "hidden" &&
				style.position !== "absolute" && box.width > 1 && box.height > 1;
		});
		if (visibleRoots.length === 0) {
			throw new Error("Expected a visible event and overflow stack.");
		}
		const rootBoxes = visibleRoots.map((root) => root.getBoundingClientRect());
		const stackBox = {
			bottom: Math.max(...rootBoxes.map((box) => box.bottom)),
			height: 0,
			top: Math.min(...rootBoxes.map((box) => box.top))
		};
		stackBox.height = stackBox.bottom - stackBox.top;
		const dayBox = targetDay.getBoundingClientRect();
		const dateBox = dateNumber.getBoundingClientRect();
		const badgeBox = badge.getBoundingClientRect();
		const badgeStyle = getComputedStyle(badge);
		const summariesBox = summaries.getBoundingClientRect();
		const summariesStyle = getComputedStyle(summaries);
		const paddingBlockStart = Number.parseFloat(summariesStyle.paddingBlockStart);
		const paddingBlockEnd = Number.parseFloat(summariesStyle.paddingBlockEnd);
		const usableTop = summariesBox.top + paddingBlockStart;
		const usableBottom = summariesBox.bottom - paddingBlockEnd;
		const anchorDayBox = anchorDay.getBoundingClientRect();
		const anchorMarkerBox = anchorMarker.getBoundingClientRect();
		const anchorSummaryBox = anchorSummary.getBoundingClientRect();
		const targetWeekIndex = weeks.indexOf(targetDay.parentElement);
		return {
			anchorMarkerBlockSize: anchorMarkerBox.height,
			anchorSummaryBlockSize: anchorSummaryBox.height,
			anchorSummaryContained: anchorSummaryBox.top >= anchorDayBox.top - 1 &&
				anchorSummaryBox.bottom <= anchorDayBox.bottom + 1,
			badgeBlockInset: badgeBox.top - dayBox.top,
			badgeBlockSize: badgeBox.height,
			badgeVisible: badgeStyle.display !== "none" && badgeBox.width > 0 && badgeBox.height > 0,
			calendarBlockSize: weeksElement.getBoundingClientRect().height,
			containsEvent: visibleRoots.some((root) =>
				root.matches(".lfc-calendar-event-summary") ||
				root.querySelector(".lfc-calendar-event-summary") !== null
			),
			containsOverflow: visibleRoots.some((root) =>
				root.matches(".lfc-calendar-grid-more") ||
				root.querySelector(".lfc-calendar-event-overflow") !== null
			),
			dateBlockInset: dateBox.top - dayBox.top,
			dateBlockSize: dateBox.height,
			domSignature: [...summaries.children].map((child) =>
				`${child.tagName}.${child.className}`
			),
			gridEventPlacement: weeksElement.getAttribute("data-lfc-grid-event-placement"),
			hostOverflow: element.scrollWidth - element.clientWidth,
			stackBlockEndGap: usableBottom - stackBox.bottom,
			stackBlockSize: stackBox.height,
			stackCenterDelta: Math.abs(
				(stackBox.top + (stackBox.height / 2)) -
				(usableTop + ((usableBottom - usableTop) / 2))
			),
			stackContained: stackBox.top >= dayBox.top - 1 &&
				stackBox.bottom <= dayBox.bottom + 1 &&
				stackBox.top >= usableTop - 1 && stackBox.bottom <= usableBottom + 1,
			stackTop: stackBox.top - dayBox.top,
			stackBlockStartGap: stackBox.top - usableTop,
			summariesBlockEndInset: dayBox.bottom - summariesBox.bottom,
			targetWeekIndex,
			visibleRootCount: visibleRoots.length,
			weekHeights: weeks.map((week) => week.getBoundingClientRect().height),
			weekRowSizing: weeksElement.getAttribute("data-lfc-week-row-sizing")
		};
	}, { anchor: WEEK_LAYOUT_ANCHOR_DATE, target: WEEK_LAYOUT_TARGET_DATE });
}

function expectEqualWeekHeights(geometry) {
	expect(geometry.weekHeights).toHaveLength(6);
	expect(Math.max(...geometry.weekHeights) - Math.min(...geometry.weekHeights))
		.toBeLessThanOrEqual(1);
}

function expectWeekLayoutContained(geometry) {
	expect(geometry.anchorSummaryBlockSize).toBeGreaterThanOrEqual(128);
	expect(geometry.anchorSummaryContained).toBe(true);
	expect(geometry.containsEvent).toBe(true);
	expect(geometry.containsOverflow).toBe(true);
	expect(geometry.hostOverflow).toBeLessThanOrEqual(1);
	expect(geometry.stackContained).toBe(true);
	expect(geometry.summariesBlockEndInset).toBeLessThanOrEqual(1);
}

async function mountResponsiveMultipleEventFixture(
	page,
	{
		compactDayMinBlockSize = null,
		compactCustomSize = null,
		customOverflow = true,
		direction = "ltr",
		eventCount = 4,
		gridEventPlacement = "bottom",
		includeSingleton = false,
		locale = null,
		markerSize = "1.25rem",
		maxGridEventsPerDay = 2,
		renderMarker = true,
		useEventProvider = false,
		weekRowSizing = null,
		width = 768
	} = {}
) {
	await expectExampleReady(page, "/examples/advanced/");
	await page.addStyleTag({
		content: `
			.my-responsive-marker {
				align-items: center;
				block-size: var(--my-responsive-marker-size);
				border: 0.125rem solid currentcolor;
				border-radius: 50%;
				display: inline-grid;
				inline-size: var(--my-responsive-marker-size);
				justify-items: center;
				position: relative;
			}
			.my-responsive-satellite {
				background: currentcolor;
				block-size: 0.375rem;
				border-radius: 50%;
				inline-size: 0.375rem;
				inset-block-end: -0.125rem;
				inset-inline-end: -0.1875rem;
				position: absolute;
			}
		`
	});
	await page.evaluate(async (fixtureOptions) => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		current?.calendar.destroy();
		current?.fixture.remove();

		const { createCalendar } = await import("/dist/index.js");
		const fixture = document.createElement("section");
		fixture.id = "my-responsive-multiple-event-fixture";
		fixture.style.inlineSize = "fit-content";
		const host = document.createElement("div");
		host.dataset["testResponsiveMultipleEventHost"] = "";
		host.dir = fixtureOptions.direction;
		host.style.inlineSize = `${String(fixtureOptions.width)}px`;
		host.style.setProperty("--my-responsive-marker-size", fixtureOptions.markerSize);
		if (fixtureOptions.compactDayMinBlockSize !== null) {
			host.style.setProperty(
				"--lfc-compact-day-min-block-size",
				fixtureOptions.compactDayMinBlockSize
			);
		}
		fixture.append(host);
		document.body.prepend(fixture);
		const observations = {
			compactCalls: 0,
			contexts: [],
			daySelectCalls: 0,
			eventActivateCalls: 0,
			markerCalls: 0,
			providerCalls: 0,
			wideCalls: 0
		};
		const multipleEvents = Array.from({ length: fixtureOptions.eventCount }, (_value, index) => {
			const hour = String(8 + (index % 12)).padStart(2, "0");
			const minute = String(index % 60).padStart(2, "0");
			return Object.freeze({
				id: `responsive-multiple-${String(index + 1)}`,
				start: `2026-08-06T${hour}:${minute}`,
				title: `Responsive multiple event ${String(index + 1)}`
			});
		});
		const events = fixtureOptions.includeSingleton
			? [Object.freeze({
				id: "responsive-singleton",
				start: `${fixtureOptions.singletonDate}T07:30`,
				title: "Responsive singleton event"
			}), ...multipleEvents]
			: multipleEvents;
		const renderHook = {
			id: "my-responsive-multiple-event-fixture",
			renderEventOverflow: (context) => {
				const {
					document: ownerDocument,
					eventCount: renderedEventCount,
					overflowCount,
					text,
					variant,
					visibleEventCount
				} = context;
				observations[`${variant}Calls`] += 1;
				observations.contexts.push({
					eventCount: renderedEventCount,
					overflowCount,
					text,
					variant,
					visibleEventCount
				});
				if (!fixtureOptions.customOverflow) {
					return undefined;
				}
				const custom = ownerDocument.createElement("span");
				custom.dataset[`testResponsive${variant === "compact" ? "Compact" : "Wide"}Overflow`] = "";
				custom.textContent = variant === "compact" ? text : `Wide ${text}`;
				if (variant === "compact" && fixtureOptions.compactCustomSize !== null) {
					custom.style.blockSize = fixtureOptions.compactCustomSize;
					custom.style.display = "inline-grid";
					custom.style.inlineSize = fixtureOptions.compactCustomSize;
					custom.style.placeItems = "center";
				}
				return custom;
			}
		};
		if (fixtureOptions.renderMarker !== null) {
			renderHook.renderEventMarker = ({ document: ownerDocument }) => {
				observations.markerCalls += 1;
				if (!fixtureOptions.renderMarker) {
					return null;
				}
				const marker = ownerDocument.createElement("span");
				marker.className = "my-responsive-marker";
				marker.setAttribute("aria-hidden", "true");
				const satellite = ownerDocument.createElement("span");
				satellite.className = "my-responsive-satellite";
				marker.append(satellite);
				return marker;
			};
		}
		const options = {
			events: fixtureOptions.useEventProvider ? () => {
				observations.providerCalls += 1;
				return events;
			} : events,
			renderHooks: [renderHook],
			initialDate: "2026-08-06",
			maxGridEventsPerDay: fixtureOptions.maxGridEventsPerDay,
			onDaySelect: () => {
				observations.daySelectCalls += 1;
			},
			onEventActivate: () => {
				observations.eventActivateCalls += 1;
			}
		};
		if (fixtureOptions.gridEventPlacement !== null) {
			options.gridEventPlacement = fixtureOptions.gridEventPlacement;
		}
		if (fixtureOptions.locale !== null) {
			options.locale = fixtureOptions.locale;
		}
		if (fixtureOptions.weekRowSizing !== null) {
			options.weekRowSizing = fixtureOptions.weekRowSizing;
		}
		const calendar = createCalendar(host, options);
		calendar.render();
		Object.defineProperty(window, "__lfcResponsiveMultipleEventFixture", {
			configurable: true,
			value: { calendar, fixture, host, observations }
		});
	}, {
		compactDayMinBlockSize,
		compactCustomSize,
		customOverflow,
		direction,
		eventCount,
		gridEventPlacement,
		includeSingleton,
		locale,
		markerSize,
		maxGridEventsPerDay,
		renderMarker,
		singletonDate: RESPONSIVE_SINGLETON_EVENT_DATE,
		useEventProvider,
		weekRowSizing,
		width
	});
	await expect.poll(() => page.evaluate(() =>
		window.__lfcResponsiveMultipleEventFixture.calendar.getState().phase
	)).toBe("ready");
	return responsiveMultipleEventFixture(page);
}

async function getCompactOverflowLayoutGeometry(
	day,
	{
		inspectPairedRoots = false,
		targetSelector = ".lfc-calendar-event-overflow-cluster"
	} = {}
) {
	return day.evaluate((element, options) => {
		const summaries = element.querySelector(":scope > .lfc-calendar-day-summaries");
		const target = summaries?.querySelector(`:scope > ${options.targetSelector}`);
		if (!(summaries instanceof HTMLElement) || !(target instanceof HTMLElement)) {
			throw new Error("Expected the compact overflow placement probes.");
		}
		const compact = target.querySelector(
			":scope > .lfc-calendar-event-overflow.lfc-is-compact"
		);
		const primary = target.querySelector(
			":scope > .lfc-calendar-event-summary.lfc-is-compact-primary"
		);
		if (options.inspectPairedRoots &&
			(!(compact instanceof HTMLElement) || !(primary instanceof HTMLElement))) {
			throw new Error("Expected both package-owned compact overflow roots.");
		}

		const dayBox = element.getBoundingClientRect();
		const weeks = element.closest(".lfc-calendar-weeks");
		const summariesBox = summaries.getBoundingClientRect();
		const targetBox = target.getBoundingClientRect();
		const summariesStyle = getComputedStyle(summaries);
		const direction = summariesStyle.direction;
		const paddingBlockStart = Number.parseFloat(summariesStyle.paddingBlockStart);
		const paddingBlockEnd = Number.parseFloat(summariesStyle.paddingBlockEnd);
		const paddedBlockStart = summariesBox.top + paddingBlockStart;
		const paddedBlockEnd = summariesBox.bottom - paddingBlockEnd;
		const centerBlock = (box) => box.top + (box.height / 2);
		const centerInline = (box) => box.left + (box.width / 2);
		const geometry = {
			compactInlineCenterDelta: null,
			direction,
			paddingBlockEnd,
			paddingBlockStart,
			roots: null,
			summariesBlockEndDelta: Math.abs(summariesBox.bottom - dayBox.bottom),
			targetBlockEndDelta: Math.abs(targetBox.bottom - paddedBlockEnd),
			targetBlockStartDelta: Math.abs(targetBox.top - paddedBlockStart),
			targetContainedInDay: targetBox.left >= dayBox.left - 1 &&
				targetBox.right <= dayBox.right + 1 &&
				targetBox.top >= dayBox.top - 1 &&
				targetBox.bottom <= dayBox.bottom + 1,
			targetInlineCenterDelta: Math.abs(centerInline(targetBox) - centerInline(dayBox)),
			weekRowSizing: weeks?.getAttribute("data-lfc-week-row-sizing") ?? null
		};
		if (compact instanceof HTMLElement) {
			const compactBox = compact.getBoundingClientRect();
			geometry.compactInlineCenterDelta = Math.abs(
				centerInline(compactBox) - centerInline(summariesBox)
			);
		}
		if (!(compact instanceof HTMLElement) || !(primary instanceof HTMLElement)) {
			return geometry;
		}

		const compactBox = compact.getBoundingClientRect();
		const primaryBox = primary.getBoundingClientRect();
		const sameRow = Math.abs(centerBlock(primaryBox) - centerBlock(compactBox)) <= 1;
		const inlineOverlap = Math.min(primaryBox.right, compactBox.right) -
			Math.max(primaryBox.left, compactBox.left);
		const blockOverlap = Math.min(primaryBox.bottom, compactBox.bottom) -
			Math.max(primaryBox.top, compactBox.top);
		const overlapDepth = Math.max(0, Math.min(inlineOverlap, blockOverlap));
		const compactOnInlineEnd = sameRow
			? direction === "rtl"
				? compactBox.right <= primaryBox.left + 1
				: compactBox.left >= primaryBox.right - 1
			: null;
		const inlineStartCenter = direction === "rtl"
			? targetBox.right - (targetBox.width / 4)
			: targetBox.left + (targetBox.width / 4);
		const inlineEndCenter = direction === "rtl"
			? targetBox.left + (targetBox.width / 4)
			: targetBox.right - (targetBox.width / 4);
		geometry.roots = {
			blockCenterDelta: Math.abs(centerBlock(primaryBox) - centerBlock(compactBox)),
			blockFillDelta: Math.abs(
				(primaryBox.height + compactBox.height) - targetBox.height
			),
			blockSizeDelta: Math.abs(primaryBox.height - compactBox.height),
			compactBlockSize: compactBox.height,
			compactInlineSize: compactBox.width,
			compactAtPaddedBlockEndDelta: Math.abs(compactBox.bottom - paddedBlockEnd),
			compactOnInlineEnd,
			containedInTarget: primaryBox.left >= targetBox.left - 1 &&
				primaryBox.right <= targetBox.right + 1 &&
				primaryBox.top >= targetBox.top - 1 &&
				primaryBox.bottom <= targetBox.bottom + 1 &&
				compactBox.left >= targetBox.left - 1 &&
				compactBox.right <= targetBox.right + 1 &&
				compactBox.top >= targetBox.top - 1 &&
				compactBox.bottom <= targetBox.bottom + 1,
			inlineCenterDelta: Math.abs(centerInline(primaryBox) - centerInline(compactBox)),
			inlineFillDelta: Math.abs(
				(primaryBox.width + compactBox.width) - targetBox.width
			),
			inlineSizeDelta: Math.abs(primaryBox.width - compactBox.width),
			layout: sameRow ? "row" : "stack",
			logicalQuarterCenterDelta: Math.max(
				Math.abs(centerInline(primaryBox) - inlineStartCenter),
				Math.abs(centerInline(compactBox) - inlineEndCenter)
			),
			primaryBlockSize: primaryBox.height,
			primaryInlineSize: primaryBox.width,
			primaryAtPaddedBlockEndDelta: Math.abs(primaryBox.bottom - paddedBlockEnd),
			overlapDepth,
			stackedQuarterCenterDelta: Math.max(
				Math.abs(centerBlock(primaryBox) - (targetBox.top + (targetBox.height / 4))),
				Math.abs(centerBlock(compactBox) - (targetBox.bottom - (targetBox.height / 4)))
			)
		};
		return geometry;
	}, { inspectPairedRoots, targetSelector });
}

async function getCompactPrimaryGeometry(day) {
	return day.evaluate((element) => {
		const primary = element.querySelector(
			".lfc-calendar-event-summary.lfc-is-compact-primary"
		);
		if (!(primary instanceof HTMLElement)) {
			throw new Error("Expected a compact primary event root.");
		}
		const dayBox = element.getBoundingClientRect();
		const primaryBox = primary.getBoundingClientRect();
		const style = getComputedStyle(primary);
		return {
			aspectRatio: style.aspectRatio,
			blockSize: primaryBox.height,
			containedInDay: primaryBox.left >= dayBox.left - 1 &&
				primaryBox.right <= dayBox.right + 1 &&
				primaryBox.top >= dayBox.top - 1 &&
				primaryBox.bottom <= dayBox.bottom + 1,
			inlineSize: primaryBox.width,
			minBlockSize: Number.parseFloat(style.minBlockSize)
		};
	});
}

async function expectEqualCompactSlotSizing(presentation, geometry) {
	expect(geometry.roots).not.toBeNull();
	const singleton = await getCompactPrimaryGeometry(presentation.singletonDay);
	expect(singleton.containedInDay).toBe(true);
	expect(Math.abs(singleton.blockSize - geometry.roots.primaryBlockSize))
		.toBeLessThanOrEqual(1);
	expect(Math.abs(singleton.blockSize - geometry.roots.compactBlockSize))
		.toBeLessThanOrEqual(1);
	expect(Math.abs(singleton.inlineSize - geometry.roots.primaryInlineSize))
		.toBeLessThanOrEqual(1);
	expect(Math.abs(singleton.inlineSize - geometry.roots.compactInlineSize))
		.toBeLessThanOrEqual(1);
	return singleton;
}

async function expectDefaultCompactSlotSize(locator) {
	const box = await locator.boundingBox();
	expect(box).not.toBeNull();
	expect(Math.abs((box?.height ?? 0) - PRIMARY_TARGET_MINIMUM)).toBeLessThanOrEqual(1);
	expect(Math.abs((box?.width ?? 0) - PRIMARY_TARGET_MINIMUM)).toBeLessThanOrEqual(1);
}

async function getCompactMarkerClearanceGeometry(day, { customOverflow }) {
	return day.evaluate((element, options) => {
		const marker = element.querySelector(".my-responsive-marker");
		const overflowRoot = element.querySelector(
			".lfc-calendar-event-overflow-cluster > " +
				".lfc-calendar-event-overflow.lfc-is-compact"
		);
		const renderedContent = overflowRoot?.querySelector(options.customOverflow
			? "[data-test-responsive-compact-overflow]"
			: ".lfc-event-overflow-default-content");
		if (!(marker instanceof HTMLElement) || !(overflowRoot instanceof HTMLElement) ||
			!(renderedContent instanceof HTMLElement)) {
			throw new Error("Expected the marker and rendered compact overflow probes.");
		}
		const contentBox = renderedContent.getBoundingClientRect();
		const markerBox = marker.getBoundingClientRect();
		const overflowBox = overflowRoot.getBoundingClientRect();
		const intersects = (first, second) => first.left < second.right &&
			first.right > second.left && first.top < second.bottom && first.bottom > second.top;
		return {
			contentBlockSize: contentBox.height,
			contentContainedInRoot: contentBox.left >= overflowBox.left - 1 &&
				contentBox.right <= overflowBox.right + 1 &&
				contentBox.top >= overflowBox.top - 1 &&
				contentBox.bottom <= overflowBox.bottom + 1,
			contentHasArea: contentBox.width > 0 && contentBox.height > 0,
			contentInlineSize: contentBox.width,
			markerBlockSize: markerBox.height,
			markerInlineSize: markerBox.width,
			markerIntersectsContent: intersects(markerBox, contentBox),
			markerIntersectsRoot: intersects(markerBox, overflowBox),
			overflowHasArea: overflowBox.width > 0 && overflowBox.height > 0
		};
	}, { customOverflow });
}

function expectCompactOverflowAtBlockEnd(geometry) {
	expect(geometry.paddingBlockEnd).toBeGreaterThan(0);
	expect(geometry.summariesBlockEndDelta).toBeLessThanOrEqual(1);
	expect(geometry.targetBlockEndDelta).toBeLessThanOrEqual(1);
	expect(geometry.targetContainedInDay).toBe(true);
}

function expectCompactOverflowAtBlockStart(geometry) {
	expect(geometry.paddingBlockStart).toBe(0);
	expect(geometry.summariesBlockEndDelta).toBeLessThanOrEqual(1);
	expect(geometry.targetBlockStartDelta).toBeLessThanOrEqual(1);
	expect(geometry.targetContainedInDay).toBe(true);
}

function expectPairedCompactOverflowLayout(geometry, { direction, layout }) {
	expectCompactOverflowAtBlockEnd(geometry);
	expect(geometry.direction).toBe(direction);
	expect(geometry.roots).not.toBeNull();
	expect(geometry.roots.layout).toBe(layout);
	expect(geometry.roots.blockSizeDelta).toBeLessThanOrEqual(1);
	expect(geometry.roots.containedInTarget).toBe(true);
	expect(geometry.roots.inlineSizeDelta).toBeLessThanOrEqual(1);
	expect(geometry.roots.overlapDepth).toBeLessThanOrEqual(1);
	expect(geometry.targetInlineCenterDelta).toBeLessThanOrEqual(1);
	if (layout === "row") {
		expect(geometry.roots.blockCenterDelta).toBeLessThanOrEqual(1);
		expect(geometry.roots.compactOnInlineEnd).toBe(true);
		expect(geometry.roots.compactAtPaddedBlockEndDelta).toBeLessThanOrEqual(1);
		if (geometry.weekRowSizing === "content") {
			expect(geometry.roots.inlineFillDelta).toBeLessThanOrEqual(1);
		}
		expect(geometry.roots.logicalQuarterCenterDelta).toBeLessThanOrEqual(1);
		expect(geometry.roots.primaryAtPaddedBlockEndDelta).toBeLessThanOrEqual(1);
		return;
	}
	if (geometry.weekRowSizing === "content") {
		expect(geometry.roots.blockFillDelta).toBeLessThanOrEqual(1);
		expect(geometry.roots.compactAtPaddedBlockEndDelta).toBeLessThanOrEqual(1);
	}
	expect(geometry.roots.inlineCenterDelta).toBeLessThanOrEqual(1);
	expect(geometry.roots.stackedQuarterCenterDelta).toBeLessThanOrEqual(1);
}

function responsiveMultipleEventFixture(page) {
	const fixture = page.locator(RESPONSIVE_MULTIPLE_EVENT_FIXTURE);
	const host = fixture.locator("[data-test-responsive-multiple-event-host]");
	const day = host.locator(
		'.lfc-calendar-day:has(> .lfc-calendar-day-button[data-lfc-date="2026-08-06"])'
	);
	const cluster = day.locator(
		":scope > .lfc-calendar-day-summaries > .lfc-calendar-event-overflow-cluster"
	);
	const overflow = day.locator(
		":scope > .lfc-calendar-day-summaries > .lfc-calendar-grid-more"
	);
	const compactOverflow = day.locator(
		".lfc-calendar-event-overflow.lfc-is-compact"
	);
	const wideOverflow = overflow.locator(
		":scope > .lfc-calendar-event-overflow.lfc-is-wide"
	);
	const singletonDay = host.locator(
		`.lfc-calendar-day:has(> .lfc-calendar-day-button[data-lfc-date="${RESPONSIVE_SINGLETON_EVENT_DATE}"])`
	);
	return {
		cluster,
		compactContent: compactOverflow.locator(
			":scope > .lfc-calendar-event-overflow-content"
		),
		compactCustom: compactOverflow.locator("[data-test-responsive-compact-overflow]"),
		compactDefault: compactOverflow.locator(".lfc-event-overflow-default-content"),
		compactOverflow,
		day,
		fixture,
		host,
		marker: day.locator(".lfc-calendar-event-summary.lfc-is-compact-primary .my-responsive-marker"),
		overflow,
		satellite: day.locator(".lfc-calendar-event-summary.lfc-is-compact-primary .my-responsive-satellite"),
		singletonDay,
		singletonPrimary: singletonDay.locator(
			".lfc-calendar-event-summary.lfc-is-compact-primary"
		),
		wideContent: wideOverflow.locator(":scope > .lfc-calendar-event-overflow-content"),
		wideCustom: wideOverflow.locator("[data-test-responsive-wide-overflow]"),
		wideDefault: wideOverflow.locator(".lfc-event-overflow-default-content"),
		wideOverflow
	};
}

async function setResponsiveMultipleEventFixtureWidth(page, width) {
	const { host } = responsiveMultipleEventFixture(page);
	await host.evaluate((element, nextWidth) => {
		element.style.inlineSize = `${String(nextWidth)}px`;
	}, width);
	await page.evaluate(async () => new Promise((resolve) => {
		requestAnimationFrame(() => { requestAnimationFrame(resolve); });
	}));
}

async function expectResponsiveMultipleEventFixtureNotToOverflow(page) {
	const { host } = responsiveMultipleEventFixture(page);
	const overflow = await host.evaluate((element) => ({
		document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		host: element.scrollWidth - element.clientWidth
	}));
	expect(overflow.document).toBeLessThanOrEqual(1);
	expect(overflow.host).toBeLessThanOrEqual(1);
}

for (const widthCase of EXACT_HOST_WIDTH_CASES) {
	test(`exact ${String(widthCase.width)}px host preserves responsive layout and target sizing`, async ({ page }) => {
		await setExactCalendarHostWidth(page, widthCase.width);

		const toolbar = page.locator(".lfc-calendar-toolbar");
		await expect(toolbar).toHaveCSS(
			"display",
			widthCase.compactEvents ? "grid" : "flex"
		);
		if (widthCase.toolbarLayout !== "wide") {
			await expectCompactToolbarVisualLayout(page, widthCase.toolbarLayout);
		}

		const shortWeekday = page.locator(".lfc-calendar-weekday-short").first();
		const narrowWeekday = page.locator(".lfc-calendar-weekday-narrow").first();
		await expect(shortWeekday).toHaveCSS("display", widthCase.narrowWeekdays ? "none" : "block");
		await expect(narrowWeekday).toHaveCSS("display", widthCase.narrowWeekdays ? "block" : "none");

		const agendaTitleLayout = await page.locator(
			".lfc-calendar-agenda-event .lfc-calendar-event-title"
		).first().evaluate((title) => ({
			column: getComputedStyle(title).gridColumnStart,
			row: getComputedStyle(title).gridRowStart
		}));
		expect(agendaTitleLayout).toEqual(widthCase.agendaReflows
			? { column: "1", row: "2" }
			: { column: "3", row: "1" });

		const action = gridEventActions(page).first();
		await expect(action).toBeVisible();
		await expect(action).toHaveAccessibleName(/.+/u);
		const sizing = await action.evaluate((eventAction) => {
			const cell = eventAction.closest(".lfc-calendar-day");
			if (!(cell instanceof HTMLElement)) {
				throw new Error("Expected the grid action to belong to a day cell.");
			}
			const actionBox = eventAction.getBoundingClientRect();
			return {
				aspectRatio: getComputedStyle(eventAction).aspectRatio,
				cellWidth: cell.getBoundingClientRect().width,
				height: actionBox.height,
				width: actionBox.width
			};
		});
		if (widthCase.compactEvents) {
			const expectedTargetSize = Math.min(PRIMARY_TARGET_MINIMUM, sizing.cellWidth);
			expect(sizing.aspectRatio).toBe("1 / 1");
			expect(sizing.width).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
			expect(sizing.height).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
			expect(Math.abs(sizing.width - expectedTargetSize)).toBeLessThanOrEqual(1);
			expect(Math.abs(sizing.height - expectedTargetSize)).toBeLessThanOrEqual(1);
		} else {
			expect(sizing.aspectRatio).toBe("auto");
			expect(sizing.width).toBeGreaterThanOrEqual(PRIMARY_TARGET_MINIMUM);
			expect(sizing.height).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
		}

		await expectToolbarDomAndFocusOrder(page);
		await expectTargetMinimums(page);
		await showSeptember(page);
		await expectResponsiveMonthLabels(page, page.locator("[data-my-calendar]"), {
			abbreviated: widthCase.abbreviatedMonthLabels,
			monthIndex: 8
		});
		await expectSingleLineMonthTitle(page);
		await setLongMonthTitle(page);
		await expectSingleLineMonthTitle(page, {
			buttonLabel: LONG_MONTH_TITLE_BUTTON_LABEL,
			compactTitle: LONG_COMPACT_MONTH_TITLE,
			overflowExpected: true,
			title: LONG_MONTH_TITLE
		});
		await expectNoHorizontalOverflow(page);
	});
}

test("short month labels use the strict 24rem content-box boundary without runtime churn", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const locale = "de-DE";
	const { host } = await mountResponsiveMultipleEventFixture(page, {
		locale,
		useEventProvider: true,
		width: 387
	});
	await setExactCalendarContentWidth(host, 385);
	await host.locator(".lfc-calendar-title-button").focus();
	await page.evaluate(() => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		const selectors = [
			".lfc-calendar-title-button",
			".lfc-calendar-title-label-full",
			".lfc-calendar-title-label-compact",
			".lfc-calendar-swipe-lane-previous .lfc-calendar-swipe-lane-label",
			".lfc-calendar-swipe-lane-previous .lfc-calendar-swipe-lane-label-full",
			".lfc-calendar-swipe-lane-previous .lfc-calendar-swipe-lane-label-compact",
			".lfc-calendar-swipe-lane-next .lfc-calendar-swipe-lane-label",
			".lfc-calendar-swipe-lane-next .lfc-calendar-swipe-lane-label-full",
			".lfc-calendar-swipe-lane-next .lfc-calendar-swipe-lane-label-compact",
			".lfc-calendar-grid",
			".lfc-calendar-event-summary"
		];
		const nodes = selectors.map((selector) => current.host.querySelector(selector));
		if (nodes.some((node) => node === null)) {
			throw new Error("Expected stable responsive month-label nodes.");
		}
		current.monthLabelSnapshot = {
			calls: {
				compact: current.observations.compactCalls,
				marker: current.observations.markerCalls,
				provider: current.observations.providerCalls,
				wide: current.observations.wideCalls
			},
			nodes,
			selectors
		};
	});

	const localizedCompact = await formatBrowserMonthTitle(page, {
		locale,
		monthIndex: 7
	});
	const englishCompact = await formatBrowserMonthTitle(page, { monthIndex: 7 });
	expect(localizedCompact).not.toBe(englishCompact);

	for (const widthCase of [
		{ abbreviated: true, contentWidth: 383 },
		{ abbreviated: false, contentWidth: 384 },
		{ abbreviated: false, contentWidth: 385 }
	]) {
		await setExactCalendarContentWidth(host, widthCase.contentWidth);
		await expectResponsiveMonthLabels(page, host, {
			abbreviated: widthCase.abbreviated,
			locale
		});
		await expect(host.locator(".lfc-calendar-title-button")).toBeFocused();
		if (widthCase.abbreviated) {
			await expectActiveMonthTitleNotToOverflow(host);
		}
	}

	const stability = await page.evaluate(() => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		const snapshot = current.monthLabelSnapshot;
		return {
			callsStable: snapshot.calls.compact === current.observations.compactCalls &&
				snapshot.calls.marker === current.observations.markerCalls &&
				snapshot.calls.provider === current.observations.providerCalls &&
				snapshot.calls.wide === current.observations.wideCalls,
			providerCalls: current.observations.providerCalls,
			nodesStable: snapshot.nodes.every((node, index) =>
				node === current.host.querySelector(snapshot.selectors[index])
			)
		};
	});
	expect(stability).toEqual({ callsStable: true, nodesStable: true, providerCalls: 1 });
});

test("default equal rows grow intrinsically and remain stable across responsive layout", async ({ page }) => {
	await prepareWeekLayoutFixturePage(page);
	const { host } = await mountWeekLayoutFixture(page);
	const initial = await getWeekLayoutGeometry(host);
	expect(initial.weekRowSizing).toBe("equal");
	expect(initial.gridEventPlacement).toBe("top");
	expectEqualWeekHeights(initial);
	expectWeekLayoutContained(initial);
	expect(initial.stackBlockStartGap).toBeLessThanOrEqual(1);
	expect(initial.stackBlockEndGap).toBeGreaterThan(8);

	await page.evaluate(() => {
		const current = window.__lfcWeekLayoutFixture;
		current.snapshot = {
			days: [...current.host.querySelectorAll(".lfc-calendar-day")],
			weeks: [...current.host.querySelectorAll(".lfc-calendar-week")]
		};
		const anchorButton = current.host.querySelector(
			'.lfc-calendar-day-button[data-lfc-date="2026-08-04"]'
		);
		const anchorDay = anchorButton?.closest(".lfc-calendar-day");
		if (!(anchorDay instanceof HTMLElement)) {
			throw new Error("Expected the tall intrinsic day.");
		}
		const marker = anchorDay.querySelector(".my-week-layout-anchor");
		if (!(marker instanceof HTMLElement)) {
			throw new Error("Expected the tall render-hook marker.");
		}
		marker.style.blockSize = "12rem";
		anchorDay.style.setProperty("--lfc-grid-event-min-block-size", "13rem");
	});
	const grown = await getWeekLayoutGeometry(host);
	expect(initial.anchorMarkerBlockSize).toBeGreaterThanOrEqual(128);
	expect(grown.anchorMarkerBlockSize).toBeGreaterThanOrEqual(192);
	expectEqualWeekHeights(grown);
	expectWeekLayoutContained(grown);
	expect(Math.min(...grown.weekHeights) - Math.max(...initial.weekHeights))
		.toBeGreaterThan(48);
	expect(grown.calendarBlockSize - initial.calendarBlockSize).toBeGreaterThan(6 * 48);

	for (const width of [390, 768]) {
		await setWeekLayoutFixtureWidth(page, width);
		const resized = await getWeekLayoutGeometry(host);
		expect(resized.weekRowSizing).toBe("equal");
		expect(resized.gridEventPlacement).toBe("top");
		expectEqualWeekHeights(resized);
		expectWeekLayoutContained(resized);
		expect(resized.stackBlockStartGap).toBeLessThanOrEqual(1);
	}

	const stability = await page.evaluate(() => {
		const current = window.__lfcWeekLayoutFixture;
		const days = [...current.host.querySelectorAll(".lfc-calendar-day")];
		const weeks = [...current.host.querySelectorAll(".lfc-calendar-week")];
		return {
			allDaysStable: current.snapshot.days.every((day, index) => day === days[index]),
			allWeeksStable: current.snapshot.weeks.every((week, index) => week === weeks[index]),
			dayCount: days.length,
			weekCount: weeks.length
		};
	});
	expect(stability).toEqual({
		allDaysStable: true,
		allWeeksStable: true,
		dayCount: 42,
		weekCount: 6
	});
});

test("content-sized rows preserve independent intrinsic week heights", async ({ page }) => {
	await prepareWeekLayoutFixturePage(page);
	const { host } = await mountWeekLayoutFixture(page, {
		weekRowSizing: "content"
	});

	for (const width of [768, 390]) {
		await setWeekLayoutFixtureWidth(page, width);
		const geometry = await getWeekLayoutGeometry(host);
		expect(geometry.weekRowSizing).toBe("content");
		expect(geometry.gridEventPlacement).toBe("top");
		expect(geometry.weekHeights).toHaveLength(6);
		expect(geometry.targetWeekIndex).toBeGreaterThanOrEqual(0);
		const sparseHeight = Math.min(...geometry.weekHeights);
		expect(geometry.weekHeights[geometry.targetWeekIndex] - sparseHeight)
			.toBeGreaterThan(48);
		expectWeekLayoutContained(geometry);
		expect(geometry.stackBlockStartGap).toBeLessThanOrEqual(1);
	}
});

for (const width of [768, 390]) {
	test(`event stacks honor top, center, and bottom placement at ${String(width)}px`, async ({ page }) => {
		await prepareWeekLayoutFixturePage(page);
		const geometries = {};
		for (const placement of ["top", "center", "bottom"]) {
			const { host } = await mountWeekLayoutFixture(page, {
				gridEventPlacement: placement,
				weekRowSizing: "equal",
				width
			});
			const geometry = await getWeekLayoutGeometry(host);
			expect(geometry.gridEventPlacement).toBe(placement);
			expect(geometry.weekRowSizing).toBe("equal");
			expectEqualWeekHeights(geometry);
			expectWeekLayoutContained(geometry);
			geometries[placement] = geometry;
		}

		expect(geometries.top.stackBlockStartGap).toBeLessThanOrEqual(1);
		expect(geometries.center.stackCenterDelta).toBeLessThanOrEqual(1);
		expect(geometries.bottom.stackBlockEndGap).toBeLessThanOrEqual(1);
		expect(geometries.center.stackTop - geometries.top.stackTop).toBeGreaterThan(8);
		expect(geometries.bottom.stackTop - geometries.center.stackTop).toBeGreaterThan(8);

		for (const placement of ["center", "bottom"]) {
			expect(Math.abs(
				geometries[placement].calendarBlockSize - geometries.top.calendarBlockSize
			)).toBeLessThanOrEqual(1);
			expect(Math.abs(
				geometries[placement].dateBlockInset - geometries.top.dateBlockInset
			)).toBeLessThanOrEqual(1);
			expect(Math.abs(
				geometries[placement].dateBlockSize - geometries.top.dateBlockSize
			)).toBeLessThanOrEqual(1);
			expect(Math.abs(
				geometries[placement].stackBlockSize - geometries.top.stackBlockSize
			)).toBeLessThanOrEqual(1);
			expect(geometries[placement].domSignature).toEqual(geometries.top.domSignature);
			expect(geometries[placement].visibleRootCount)
				.toBe(geometries.top.visibleRootCount);
			for (const [index, height] of geometries[placement].weekHeights.entries()) {
				expect(Math.abs(height - geometries.top.weekHeights[index]))
					.toBeLessThanOrEqual(1);
			}
		}
		if (width === 768) {
			expect(geometries.top.badgeVisible).toBe(true);
			for (const placement of ["center", "bottom"]) {
				expect(geometries[placement].badgeVisible).toBe(true);
				expect(Math.abs(
					geometries[placement].badgeBlockInset - geometries.top.badgeBlockInset
				)).toBeLessThanOrEqual(1);
				expect(Math.abs(
					geometries[placement].badgeBlockSize - geometries.top.badgeBlockSize
				)).toBeLessThanOrEqual(1);
			}
		}
	});
}

test("omitted placement keeps compact overflow branches at the top", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const mountDefaultTop = async (options = {}) => {
		const presentation = await mountResponsiveMultipleEventFixture(page, {
			compactDayMinBlockSize: "10rem",
			gridEventPlacement: null,
			width: 390,
			...options
		});
		await expect(presentation.host.locator(".lfc-calendar-weeks"))
			.toHaveAttribute("data-lfc-grid-event-placement", "top");
		return presentation;
	};

	let presentation = await mountDefaultTop();
	await expect(presentation.compactCustom).toBeVisible();
	await expect(presentation.compactCustom).toHaveText("+3");
	expectCompactOverflowAtBlockStart(
		await getCompactOverflowLayoutGeometry(presentation.day)
	);

	presentation = await mountDefaultTop({ customOverflow: false, renderMarker: false });
	await expect(presentation.marker).toHaveCount(0);
	await expect(presentation.compactDefault).toBeVisible();
	await expect(presentation.compactDefault).toHaveText("4");
	expectCompactOverflowAtBlockStart(
		await getCompactOverflowLayoutGeometry(presentation.day)
	);

	presentation = await mountDefaultTop({ maxGridEventsPerDay: 0 });
	await expect(presentation.overflow).toHaveClass(/lfc-is-compact-primary/u);
	await expect(presentation.compactCustom).toBeVisible();
	await expect(presentation.compactCustom).toHaveText("4");
	expectCompactOverflowAtBlockStart(
		await getCompactOverflowLayoutGeometry(presentation.day, {
			targetSelector: ".lfc-calendar-grid-more.lfc-is-compact-primary"
		})
	);
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

for (const width of [412, 390]) {
	test(`advanced content-sized ${String(width)}px layout grows rows independently and matches DOM focus order`, async ({ page }) => {
		await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width });
		await expectExampleReady(page, "/examples/advanced/");
		await page.addStyleTag({
			content: ".my-calendar { --lfc-day-min-block-size: 12rem; }"
		});

		const hostWidth = await page.locator("[data-my-calendar]").evaluate((host) =>
			host.getBoundingClientRect().width
		);
		expect(hostWidth).toBeGreaterThan(20 * 16);
		expect(hostWidth).toBeLessThanOrEqual(42 * 16);

		await expect(page.locator(".lfc-calendar-toolbar")).toHaveCSS("display", "grid");
		await expectCompactToolbarVisualLayout(page, "two-row");

		const customProperty = await page.locator("[data-my-calendar]").evaluate((host) =>
			getComputedStyle(host).getPropertyValue("--lfc-day-min-block-size").trim()
		);
		expect(customProperty).toBe("12rem");
		const weekHeights = await page.locator(".lfc-calendar-week").evaluateAll((weeks) =>
			weeks.map((week) => week.getBoundingClientRect().height)
		);
		await expect(page.locator(".lfc-calendar-weeks"))
			.toHaveAttribute("data-lfc-week-row-sizing", "content");
		await expect(page.locator(".lfc-calendar-weeks"))
			.toHaveAttribute("data-lfc-grid-event-placement", "bottom");
		expect(weekHeights).toHaveLength(6);
		expect(Math.max(...weekHeights) - Math.min(...weekHeights)).toBeGreaterThan(1);
		for (const height of weekHeights) {
			expect(height).toBeGreaterThanOrEqual(COMPACT_ROW_MINIMUM);
			expect(height).toBeLessThanOrEqual(COMPACT_ROW_MAXIMUM);
		}

		await expectToolbarDomAndFocusOrder(page);
		await expectTargetMinimums(page);
		await expectNoHorizontalOverflow(page);
	});
}

test("compact grid actions honor the public minimum block-size token", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.addStyleTag({
		content: ".my-calendar { --lfc-grid-event-min-block-size: 3rem; }"
	});

	const primaryAction = page.locator(
		".lfc-calendar-event-summary.lfc-is-compact-primary"
	).first();
	await expect(primaryAction).toBeVisible();
	const sizing = await primaryAction.evaluate((action) => ({
		blockSize: action.getBoundingClientRect().height,
		minimum: getComputedStyle(action).minBlockSize,
		token: getComputedStyle(action).getPropertyValue("--lfc-grid-event-min-block-size").trim()
	}));
	expect(sizing.token).toBe("3rem");
	expect(sizing.minimum).toBe("48px");
	expect(sizing.blockSize).toBeGreaterThanOrEqual(48);
});

test("equal compact slots honor the existing public control and event size tokens", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		customOverflow: false,
		includeSingleton: true,
		renderMarker: null,
		width: 390
	});
	await presentation.host.evaluate((host) => {
		host.style.setProperty("--lfc-control-min-size", "3rem");
		host.style.setProperty("--lfc-grid-event-min-block-size", "3rem");
	});
	await setResponsiveMultipleEventFixtureWidth(page, 390);
	const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
		inspectPairedRoots: true
	});
	expectPairedCompactOverflowLayout(geometry, { direction: "ltr", layout: "stack" });
	const singleton = await expectEqualCompactSlotSizing(presentation, geometry);
	expect(singleton.blockSize).toBeGreaterThanOrEqual(48);
	expect(singleton.inlineSize).toBeGreaterThanOrEqual(48);
});

test("focused later compact actions retain a keyboard-operable target for minimal content", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");

	const selectedCell = page.getByRole("grid").locator(
		'[role="gridcell"][aria-selected="true"]'
	);
	const dayButton = selectedCell.locator(":scope > .lfc-calendar-day-button");
	const actions = selectedCell.locator(
		":scope > .lfc-calendar-day-summaries :is(a, button)"
	);
	await expect(actions).toHaveCount(3);
	const laterAction = actions.nth(1);
	await laterAction.evaluate((action) => {
		const details = action.querySelector(".lfc-calendar-event-details");
		const leadingContent = action.querySelector(".lfc-calendar-event-leading-content");
		const marker = action.querySelector(".lfc-calendar-event-marker");
		const title = action.querySelector(".lfc-calendar-event-title");
		const trailing = action.querySelector(".lfc-calendar-event-trailing");
		if (!(details instanceof HTMLElement) || !(leadingContent instanceof HTMLElement) ||
			!(marker instanceof HTMLElement) || !(title instanceof HTMLElement) ||
			!(trailing instanceof HTMLElement)) {
			throw new Error("Expected every stable grid event slot.");
		}
		details.replaceChildren();
		leadingContent.replaceChildren();
		marker.replaceChildren();
		title.textContent = "I";
		trailing.replaceChildren();
	});

	await dayButton.focus();
	await dayButton.press("F2");
	await expect(actions.first()).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(laterAction).toBeFocused();
	await expect(laterAction).toHaveAccessibleName(/.+/u);

	const box = await laterAction.boundingBox();
	expect(box).not.toBeNull();
	expect(box?.width ?? 0).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
	const intrinsicSizing = await laterAction.evaluate((action) => ({
		aspectRatio: getComputedStyle(action).aspectRatio,
		compactPrimary: action.classList.contains("lfc-is-compact-primary"),
		minBlockSize: getComputedStyle(action).minBlockSize
	}));
	expect(intrinsicSizing).toEqual({
		aspectRatio: "auto",
		compactPrimary: false,
		minBlockSize: `${String(GRID_TARGET_MINIMUM)}px`
	});
	await expectNoHorizontalOverflow(page);

	await laterAction.press("Enter");
	await expect(page.locator("[data-my-event-dialog]")).toBeVisible();
});

test("compact layout applies the public day-padding token to day and event geometry", async ({ page }) => {
	await setExactCalendarHostWidth(page, 375);
	await page.addStyleTag({
		content: ".my-calendar { --lfc-day-padding: 0.75rem; }"
	});

	const metrics = await page.locator(
		".lfc-calendar-day:has(.lfc-calendar-event-summary.lfc-is-compact-primary)"
	).first().evaluate((cell) => {
		const action = cell.querySelector(".lfc-calendar-event-summary.lfc-is-compact-primary");
		const button = cell.querySelector(".lfc-calendar-day-button");
		const dayNumber = cell.querySelector(".lfc-calendar-day-number");
		const summaries = cell.querySelector(".lfc-calendar-day-summaries");
		if (!(action instanceof HTMLElement) || !(button instanceof HTMLElement) ||
			!(dayNumber instanceof HTMLElement) || !(summaries instanceof HTMLElement)) {
			throw new Error("Expected compact day and event layout elements.");
		}
		const actionBox = action.getBoundingClientRect();
		const cellBox = cell.getBoundingClientRect();
		const dayNumberBox = dayNumber.getBoundingClientRect();
		const actionStyle = getComputedStyle(action);
		const buttonStyle = getComputedStyle(button);
		const summariesStyle = getComputedStyle(summaries);
		return {
			actionBlockEndInset: cellBox.bottom - actionBox.bottom,
			actionBlockSize: actionBox.height,
			actionInlineSize: actionBox.width,
			actionPadding: actionStyle.paddingBlockStart,
			buttonBlockPadding: buttonStyle.paddingBlockStart,
			buttonInlinePadding: buttonStyle.paddingInlineStart,
			dayNumberBlockInset: dayNumberBox.top - cellBox.top,
			summariesBlockEndInset: cellBox.bottom - summaries.getBoundingClientRect().bottom,
			summariesBlockPadding: summariesStyle.paddingBlockEnd,
			summariesInlinePadding: summariesStyle.paddingInlineStart,
			summariesMargin: summariesStyle.marginBlockStart
		};
	});

	expect(metrics.actionPadding).toBe("12px");
	expect(metrics.buttonBlockPadding).toBe("12px");
	expect(metrics.buttonInlinePadding).toBe("12px");
	expect(metrics.summariesBlockPadding).toBe("12px");
	expect(metrics.summariesInlinePadding).toBe("0px");
	expect(metrics.summariesMargin).toBe("46px");
	expect(Math.abs(metrics.dayNumberBlockInset - 12)).toBeLessThanOrEqual(1);
	expect(metrics.summariesBlockEndInset).toBeLessThanOrEqual(1);
	expect(Math.abs(metrics.actionBlockEndInset - 12)).toBeLessThanOrEqual(1);
	expect(metrics.actionInlineSize).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
	expect(metrics.actionBlockSize).toBeGreaterThanOrEqual(GRID_TARGET_MINIMUM);
	await expectNoHorizontalOverflow(page);
});

test("sub-20rem calendar places title and direction controls before Today", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 320 });
	await expectExampleReady(page, "/examples/advanced/");

	const hostWidth = await page.locator("[data-my-calendar]").evaluate((host) =>
		host.getBoundingClientRect().width
	);
	expect(hostWidth).toBeLessThan(20 * 16);

	await expectCompactToolbarVisualLayout(page, "three-row");

	await expectToolbarDomAndFocusOrder(page);
	await expectTargetMinimums(page);
	await expectNoHorizontalOverflow(page);
});

test("compact RTL layout reflows at 200% text size without changing focus order", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.locator("[data-my-direction]").check();
	await page.addStyleTag({ content: "html { font-size: 200%; }" });

	const directionAndReflow = await page.locator("[data-my-calendar]").evaluate((host) => {
		const weekdays = [...host.querySelectorAll(".lfc-calendar-weekday")];
		const firstWeekday = weekdays.at(0);
		const lastWeekday = weekdays.at(-1);
		if (!(firstWeekday instanceof HTMLElement) || !(lastWeekday instanceof HTMLElement)) {
			throw new Error("Expected rendered weekday headings.");
		}
		return {
			direction: getComputedStyle(host).direction,
			firstWeekdayCenter: firstWeekday.getBoundingClientRect().x +
				(firstWeekday.getBoundingClientRect().width / 2),
			hostWidth: host.getBoundingClientRect().width,
			lastWeekdayCenter: lastWeekday.getBoundingClientRect().x +
				(lastWeekday.getBoundingClientRect().width / 2),
			rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
		};
	});
	expect(directionAndReflow.direction).toBe("rtl");
	expect(directionAndReflow.rootFontSize).toBe(REFLOW_ROOT_FONT_SIZE);
	expect(directionAndReflow.hostWidth).toBeLessThan(20 * REFLOW_ROOT_FONT_SIZE);
	expect(directionAndReflow.firstWeekdayCenter).toBeGreaterThan(
		directionAndReflow.lastWeekdayCenter
	);

	await expectCompactToolbarVisualLayout(page, "three-row");
	await expectToolbarDomAndFocusOrder(page);
	await expectTargetMinimums(page);
	await showSeptember(page);
	await expectSingleLineMonthTitle(page);
	await setLongMonthTitle(page);
	await expectSingleLineMonthTitle(page, {
		buttonLabel: LONG_MONTH_TITLE_BUTTON_LABEL,
		compactTitle: LONG_COMPACT_MONTH_TITLE,
		overflowExpected: true,
		title: LONG_MONTH_TITLE
	});
	await expectNoHorizontalOverflow(page);
});

for (const preference of [
	{
		eventBoundaryMinimum: 2,
		focusMinimum: 3,
		focusTokenMinimum: 4,
		label: "increased contrast",
		media: { contrast: "more", forcedColors: "none" },
		query: "(prefers-contrast: more)"
	},
	{
		eventBoundaryMinimum: 1,
		focusMinimum: 3,
		focusTokenMinimum: 3,
		label: "forced colors",
		media: { contrast: "no-preference", forcedColors: "active" },
		query: "(forced-colors: active)"
	}
]) {
	test(`compact ${preference.label} keeps focus, boundaries, and targets visible`, async ({
		baseURL,
		browser,
		browserName
	}) => {
		await withMediaContextPage(browser, baseURL, preference.media, async (page) => {
			await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
			await expectExampleReady(page, "/examples/advanced/");

			const mediaMatches = await page.evaluate(
				(query) => matchMedia(query).matches,
				preference.query
			);
			test.skip(
				!mediaMatches,
				`The pinned ${browserName} build cannot emulate ${preference.query}.`
			);
			await page.locator(".lfc-calendar-nav-button-next").focus();
			await page.keyboard.press("Tab");
			const titleButton = page.locator(".lfc-calendar-title-button");
			await expect(titleButton).toBeFocused();

			const visuals = await page.evaluate(() => {
				const title = document.querySelector(".lfc-calendar-title-button");
				const grid = document.querySelector(".lfc-calendar-grid");
				const event = document.querySelector(".lfc-calendar-agenda-event");
				const compactOverflow = document.querySelector(
					".lfc-calendar-event-overflow.lfc-is-compact"
				);
				if (!(title instanceof HTMLElement) || !(grid instanceof HTMLElement) ||
					!(event instanceof HTMLElement) || !(compactOverflow instanceof HTMLElement)) {
					throw new Error("Expected the title, grid, event, and compact overflow probes.");
				}
				const titleStyle = getComputedStyle(title);
				const gridStyle = getComputedStyle(grid);
				const eventStyle = getComputedStyle(event);
				const compactOverflowStyle = getComputedStyle(compactOverflow);
				const focusTokenProbe = document.createElement("span");
				focusTokenProbe.style.cssText =
					"position: absolute; width: var(--lfc-internal-focus-size);";
				title.append(focusTokenProbe);
				const focusTokenWidth = Number.parseFloat(
					getComputedStyle(focusTokenProbe).width
				);
				focusTokenProbe.remove();
				return {
					compactOverflowColor: compactOverflowStyle.color,
					compactOverflowDisplay: compactOverflowStyle.display,
					compactOverflowPointerEvents: compactOverflowStyle.pointerEvents,
					eventBoundaryColor: eventStyle.borderBlockStartColor,
					eventBoundaryStyle: eventStyle.borderBlockStartStyle,
					eventBoundaryWidth: Number.parseFloat(eventStyle.borderBlockStartWidth),
					focusColor: titleStyle.outlineColor,
					focusStyle: titleStyle.outlineStyle,
					focusTokenWidth,
					focusWidth: Number.parseFloat(titleStyle.outlineWidth),
					gridBoundaryColor: gridStyle.borderBlockStartColor,
					gridBoundaryStyle: gridStyle.borderBlockStartStyle,
					gridBoundaryWidth: Number.parseFloat(gridStyle.borderBlockStartWidth)
				};
			});

			expect(visuals.compactOverflowDisplay).not.toBe("none");
			expect(visuals.compactOverflowPointerEvents).toBe("none");
			expect(visuals.compactOverflowColor).not.toBe("rgba(0, 0, 0, 0)");
			expect(visuals.focusStyle).toBe("solid");
			expect(visuals.focusTokenWidth).toBeGreaterThanOrEqual(
				preference.focusTokenMinimum
			);
			expect(visuals.focusWidth).toBeGreaterThanOrEqual(preference.focusMinimum);
			expect(visuals.focusColor).not.toBe("rgba(0, 0, 0, 0)");
			expect(visuals.eventBoundaryStyle).toBe("solid");
			expect(visuals.eventBoundaryWidth).toBeGreaterThanOrEqual(
				preference.eventBoundaryMinimum
			);
			expect(visuals.eventBoundaryColor).not.toBe("rgba(0, 0, 0, 0)");
			expect(visuals.gridBoundaryStyle).toBe("solid");
			expect(visuals.gridBoundaryWidth).toBeGreaterThanOrEqual(1);
			expect(visuals.gridBoundaryColor).not.toBe("rgba(0, 0, 0, 0)");
			await expectTargetMinimums(page);
			await expectNoHorizontalOverflow(page);
		});
	});
}

test("application toolbar disclosure toggles without runtime or focus churn", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.evaluate(() => {
		const host = document.querySelector("[data-my-calendar]");
		const toolbar = document.querySelector(".lfc-calendar-toolbar");
		const toolbarEnd = document.querySelector(".lfc-calendar-toolbar-end");
		const grid = document.querySelector(".lfc-calendar-grid");
		if (!(host instanceof HTMLElement) || !(toolbar instanceof HTMLElement) ||
			!(toolbarEnd instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
			throw new Error("Expected stable calendar regions.");
		}

		const disclosure = document.createElement("details");
		disclosure.dataset["testResponsiveDisclosure"] = "";
		disclosure.open = true;
		const summary = document.createElement("summary");
		summary.textContent = "Application options";
		const content = document.createElement("span");
		content.dataset["testResponsiveDisclosureContent"] = "";
		content.textContent = "Additional application controls";
		disclosure.append(summary, content);
		toolbarEnd.append(disclosure);

		const sourceObserver = new MutationObserver(() => {
			window.__lfcToolbarDisclosureSnapshot.sourceMutations += 1;
		});
		const snapshot = {
			nodes: [host, toolbar, toolbarEnd, disclosure, summary, content, grid],
			sourceMutations: 0,
			sourceObserver,
			sourceRange: host.dataset["testSourceRange"]
		};
		Object.defineProperty(window, "__lfcToolbarDisclosureSnapshot", { value: snapshot });
		sourceObserver.observe(host, {
			attributeFilter: ["data-test-source-range"],
			attributes: true
		});
	});

	const disclosure = page.locator("[data-test-responsive-disclosure]");
	const summary = disclosure.locator("summary");
	const content = disclosure.locator("[data-test-responsive-disclosure-content]");
	await expect(disclosure).toHaveAttribute("open", "");
	await expect(content).toBeVisible();
	await summary.focus();
	await summary.click();
	await expect(disclosure).not.toHaveAttribute("open", "");
	await expect(content).toBeHidden();
	await expect(summary).toBeFocused();
	await summary.click();
	await expect(disclosure).toHaveAttribute("open", "");
	await expect(content).toBeVisible();
	await expect(summary).toBeFocused();
	await page.evaluate(async () => {
		await new Promise((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(resolve);
			});
		});
	});

	const stability = await page.evaluate(() => {
		const snapshot = window.__lfcToolbarDisclosureSnapshot;
		const currentNodes = [
			document.querySelector("[data-my-calendar]"),
			document.querySelector(".lfc-calendar-toolbar"),
			document.querySelector(".lfc-calendar-toolbar-end"),
			document.querySelector("[data-test-responsive-disclosure]"),
			document.querySelector("[data-test-responsive-disclosure] summary"),
			document.querySelector("[data-test-responsive-disclosure-content]"),
			document.querySelector(".lfc-calendar-grid")
		];
		snapshot.sourceObserver.disconnect();
		return {
			allNodesStable: snapshot.nodes.every((node, index) => node === currentNodes[index]),
			sourceMutations: snapshot.sourceMutations,
			sourceRangeStable: snapshot.sourceRange ===
				document.querySelector("[data-my-calendar]")?.getAttribute(
					"data-test-source-range"
				)
		};
	});
	expect(stability).toEqual({
		allNodesStable: true,
		sourceMutations: 0,
		sourceRangeStable: true
	});
	await expectNoHorizontalOverflow(page);
});

test("compact toolbar grows and wraps long application content without clipping", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.evaluate(() => {
		const today = document.querySelector(".lfc-calendar-today-button");
		const legend = document.querySelector("[data-my-toolbar-end] legend");
		if (!(today instanceof HTMLButtonElement) || !(legend instanceof HTMLElement)) {
			throw new Error("Expected compact toolbar content.");
		}
		today.textContent = "Return to the current schedule date";
		legend.textContent = "Choose the event categories shown in this calendar";
		for (const label of document.querySelectorAll("[data-my-toolbar-end] label")) {
			label.append(document.createTextNode(" with an intentionally long localized label"));
		}
	});

	await expectNoHorizontalOverflow(page);
	const contentMetrics = await page.locator(".lfc-calendar-toolbar").evaluate((toolbar) =>
		[...toolbar.querySelectorAll("button, legend, label")]
			.filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
			.map((element) => ({
				clientWidth: element.clientWidth,
				height: element.getBoundingClientRect().height,
				scrollWidth: element.scrollWidth
			}))
	);
	expect(contentMetrics.length).toBeGreaterThan(0);
	for (const metric of contentMetrics) {
		expect(metric.height).toBeGreaterThan(0);
		expect(metric.scrollWidth - metric.clientWidth).toBeLessThanOrEqual(1);
	}
});

test("compact marker render hooks can visibly overflow their marker slot", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.addStyleTag({
		content: `
			.my-event-marker { position: relative; }
			[data-test-overflow-probe] {
				background: currentcolor;
				block-size: 0.5rem;
				border-radius: 50%;
				inline-size: 0.5rem;
				inset-block-end: -0.375rem;
				inset-inline-end: -0.375rem;
				position: absolute;
			}
		`
	});
	const action = gridEventActions(page, "milestone:3").first();
	await expect(action).toBeVisible();
	await action.scrollIntoViewIfNeeded();
	await action.locator(".my-event-marker").evaluate((marker) => {
		const probe = document.createElement("span");
		probe.setAttribute("data-test-overflow-probe", "");
		marker.append(probe);
	});

	const result = await action.evaluate((eventAction) => {
		const packageMarker = eventAction.querySelector(".lfc-calendar-event-marker");
		const leading = eventAction.querySelector(".lfc-calendar-event-leading");
		const probe = eventAction.querySelector("[data-test-overflow-probe]");
		if (!(packageMarker instanceof HTMLElement) || !(leading instanceof HTMLElement) ||
			!(probe instanceof HTMLElement)) {
			throw new Error("Expected the package marker, leading slot, and overflow probe.");
		}
		const markerBox = packageMarker.getBoundingClientRect();
		const probeBox = probe.getBoundingClientRect();
		const pointTarget = document.elementFromPoint(
			probeBox.left + (probeBox.width / 2),
			probeBox.top + (probeBox.height / 2)
		);
		return {
			actionOverflow: getComputedStyle(eventAction).overflow,
			leadingOverflow: getComputedStyle(leading).overflow,
			markerOverflow: getComputedStyle(packageMarker).overflow,
			probeEscapesMarker: probeBox.right > markerBox.right || probeBox.bottom > markerBox.bottom,
			probeIsHitTestable: pointTarget === probe || probe.contains(pointTarget)
		};
	});
	expect(result).toEqual({
		actionOverflow: "visible",
		leadingOverflow: "visible",
		markerOverflow: "visible",
		probeEscapesMarker: true,
		probeIsHitTestable: true
	});
});

test("compact agenda events collapse suppressed and empty slots without orphan gaps", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	const event = page.locator(".lfc-calendar-agenda-event").first();
	await expect(event).toBeVisible();
	await event.scrollIntoViewIfNeeded();

	const layout = await event.evaluate((eventRoot) => {
		const countGridTracks = (value) => {
			let count = 0;
			let depth = 0;
			let insideTrack = false;
			for (const character of value) {
				if (/\s/u.test(character) && depth === 0) {
					insideTrack = false;
					continue;
				}
				if (!insideTrack) {
					count += 1;
					insideTrack = true;
				}
				if (character === "(") {
					depth += 1;
				} else if (character === ")") {
					depth -= 1;
				}
			}
			return count;
		};
		const leading = eventRoot.querySelector(":scope > .lfc-calendar-event-leading");
		const marker = leading?.querySelector(":scope > .lfc-calendar-event-marker");
		const leadingContent = leading?.querySelector(
			":scope > .lfc-calendar-event-leading-content"
		);
		const time = eventRoot.querySelector(":scope > .lfc-calendar-time");
		const title = eventRoot.querySelector(":scope > .lfc-calendar-event-title");
		const trailing = eventRoot.querySelector(":scope > .lfc-calendar-event-trailing");
		if (!(leading instanceof HTMLElement) || !(marker instanceof HTMLElement) ||
			!(leadingContent instanceof HTMLElement) || !(time instanceof HTMLElement) ||
			!(title instanceof HTMLElement) || !(trailing instanceof HTMLElement)) {
			throw new Error("Expected every stable agenda event slot.");
		}

		marker.replaceChildren();
		leadingContent.replaceChildren();
		const leadingSuppressedStyle = getComputedStyle(eventRoot);
		const leadingSuppressedColumns = countGridTracks(
			leadingSuppressedStyle.gridTemplateColumns
		);
		const timeColumn = getComputedStyle(time).gridColumnStart;

		time.classList.add("lfc-visually-hidden");
		trailing.replaceChildren();
		const collapsedStyle = getComputedStyle(eventRoot);
		const eventBox = eventRoot.getBoundingClientRect();
		const titleBox = title.getBoundingClientRect();
		const expectedInlineStart = eventBox.left + Number.parseFloat(collapsedStyle.borderLeftWidth) +
			Number.parseFloat(collapsedStyle.paddingLeft);
		const expectedBlockStart = eventBox.top + Number.parseFloat(collapsedStyle.borderTopWidth) +
			Number.parseFloat(collapsedStyle.paddingTop);

		return {
			collapsedColumns: countGridTracks(collapsedStyle.gridTemplateColumns),
			leadingDisplay: getComputedStyle(leading).display,
			leadingSuppressedColumns,
			timeColumn,
			timePosition: getComputedStyle(time).position,
			titleBlockInset: titleBox.top - expectedBlockStart,
			titleColumn: getComputedStyle(title).gridColumnStart,
			titleInlineInset: titleBox.left - expectedInlineStart,
			titleRow: getComputedStyle(title).gridRowStart,
			trailingDisplay: getComputedStyle(trailing).display
		};
	});

	expect(layout.leadingSuppressedColumns).toBe(2);
	expect(layout.timeColumn).toBe("1");
	expect(layout.collapsedColumns).toBe(1);
	expect(layout.leadingDisplay).toBe("none");
	expect(layout.timePosition).toBe("absolute");
	expect(layout.trailingDisplay).toBe("none");
	expect(layout.titleColumn).toBe("1");
	expect(layout.titleRow).toBe("1");
	expect(Math.abs(layout.titleInlineInset)).toBeLessThanOrEqual(1);
	expect(Math.abs(layout.titleBlockInset)).toBeLessThanOrEqual(1);
});

test("crossing the compact container boundary changes only CSS layout", async ({ page }) => {
	await page.addInitScript(() => {
		const signals = { resizeListeners: 0, resizeObservers: 0 };
		Object.defineProperty(window, "__lfcResponsiveSignals", { value: signals });
		const addEventListener = window.addEventListener.bind(window);
		window.addEventListener = (type, listener, options) => {
			if (type === "resize") {
				signals.resizeListeners += 1;
			}
			addEventListener(type, listener, options);
		};
		const NativeResizeObserver = window.ResizeObserver;
		window.ResizeObserver = new Proxy(NativeResizeObserver, {
			construct(target, argumentsList, newTarget) {
				signals.resizeObservers += 1;
				return Reflect.construct(target, argumentsList, newTarget);
			}
		});
	});
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 760 });
	await expectExampleReady(page, "/examples/advanced/");
	await expect(page.locator(".lfc-calendar-toolbar")).toHaveCSS("display", "flex");
	await page.locator(".lfc-calendar-title-button").focus();

	await page.evaluate(() => {
		const selectors = [
			"[data-my-calendar]",
			".lfc-calendar-toolbar",
			".lfc-calendar-title-button",
			".lfc-calendar-grid",
			'[data-test-event-surface="grid-summary"]'
		];
		const nodes = selectors.map((selector) => document.querySelector(selector));
		if (nodes.some((node) => node === null)) {
			throw new Error("Expected stable responsive-layout nodes.");
		}
		const counters = { sourceMutations: 0, stateMutations: 0 };
		const sourceObserver = new MutationObserver((records) => {
			counters.sourceMutations += records.length;
		});
		const stateObserver = new MutationObserver((records) => {
			counters.stateMutations += records.length;
		});
		sourceObserver.observe(nodes[0], {
			attributeFilter: ["data-test-source-range"],
			attributes: true
		});
		stateObserver.observe(document.documentElement, {
			attributeFilter: ["data-test-phase", "data-test-ready"],
			attributes: true
		});
		for (const stateElement of document.querySelectorAll("[data-my-state-phase], [data-my-state-month], [data-my-state-selected], [data-my-state-range], [data-my-state-issues]")) {
			stateObserver.observe(stateElement, { childList: true, subtree: true });
		}
		Object.defineProperty(window, "__lfcResponsiveSnapshot", {
			value: {
				counters,
				nodes,
				resizeObservers: window.__lfcResponsiveSignals.resizeObservers,
				sourceObserver,
				stateObserver
			}
		});
	});

	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 680 });
	await expect(page.locator(".lfc-calendar-toolbar")).toHaveCSS("display", "grid");
	await page.evaluate(async () => {
		await new Promise((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(resolve);
			});
		});
	});

	await expect(page.locator(".lfc-calendar-title-button")).toBeFocused();
	const stability = await page.evaluate(() => {
		const snapshot = window.__lfcResponsiveSnapshot;
		const currentNodes = [
			document.querySelector("[data-my-calendar]"),
			document.querySelector(".lfc-calendar-toolbar"),
			document.querySelector(".lfc-calendar-title-button"),
			document.querySelector(".lfc-calendar-grid"),
			document.querySelector('[data-test-event-surface="grid-summary"]')
		];
		const signals = window.__lfcResponsiveSignals;
		return {
			allNodesStable: snapshot.nodes.every((node, index) => node === currentNodes[index]),
			resizeListeners: signals.resizeListeners,
			resizeObserversStable: signals.resizeObservers === snapshot.resizeObservers,
			sourceMutations: snapshot.counters.sourceMutations,
			stateMutations: snapshot.counters.stateMutations
		};
	});
	expect(stability).toEqual({
		allNodesStable: true,
		resizeListeners: 0,
		resizeObserversStable: true,
		sourceMutations: 0,
		stateMutations: 0
	});
});

test("event-overflow variants and their custom marker cross compact widths without churn", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		includeSingleton: true
	});
	await expect(presentation.compactOverflow).toBeHidden();
	await expect(presentation.wideOverflow).toBeVisible();
	await expect(presentation.wideOverflow).toHaveAttribute("aria-hidden", "true");
	await expect(presentation.wideCustom).toHaveText("Wide 2 more");
	await expect(presentation.wideDefault).toBeHidden();
	await expect(presentation.overflow).toHaveAccessibleName(/View 2 more events/u);
	const initialCalls = await page.evaluate((singletonDate) => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		current.snapshot = {
			calls: {
				compactCalls: current.observations.compactCalls,
				markerCalls: current.observations.markerCalls,
				wideCalls: current.observations.wideCalls
			},
			days: [...current.host.querySelectorAll(".lfc-calendar-day")],
			nodes: [
				current.host.querySelector(
					".lfc-calendar-event-overflow.lfc-is-compact"
				),
				current.host.querySelector(".lfc-calendar-grid-more"),
				current.host.querySelector(
					".lfc-calendar-event-overflow.lfc-is-wide"
				),
				current.host.querySelector("[data-test-responsive-compact-overflow]"),
				current.host.querySelector("[data-test-responsive-wide-overflow]"),
				current.host.querySelector(
					'.lfc-calendar-event-summary[data-lfc-date="2026-08-06"] ' +
						".my-responsive-marker"
				),
				current.host.querySelector(
					`.lfc-calendar-event-summary[data-lfc-date="${singletonDate}"]`
				)
			],
			weeks: [...current.host.querySelectorAll(".lfc-calendar-week")]
		};
		return current.snapshot.calls;
	}, RESPONSIVE_SINGLETON_EVENT_DATE);
	expect(initialCalls.compactCalls).toBe(1);
	expect(initialCalls.markerCalls).toBeGreaterThan(0);
	expect(initialCalls.wideCalls).toBe(1);

	await setResponsiveMultipleEventFixtureWidth(page, 412);
	await presentation.day.locator(":scope > .lfc-calendar-day-button").focus();
	await page.keyboard.press("F2");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await expect(presentation.overflow).toBeFocused();
	for (const width of [660, 412, 390, 320, 280, 660]) {
		await setResponsiveMultipleEventFixtureWidth(page, width);
		await expect(presentation.compactOverflow).toBeVisible();
		await expect(presentation.compactOverflow).toHaveAttribute("aria-hidden", "true");
		await expect(presentation.compactOverflow).toHaveCSS("pointer-events", "none");
		await expect(presentation.compactCustom).toHaveText("+3");
		await expect(presentation.overflow).toBeFocused();
		await expect(presentation.wideOverflow).toBeVisible();
		await expect(presentation.wideCustom).toHaveText("Wide 2 more");
		if (width >= 320) {
			const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
				inspectPairedRoots: true
			});
			await expectEqualCompactSlotSizing(presentation, geometry);
		}
		await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	}

	await setResponsiveMultipleEventFixtureWidth(page, 768);
	await expect(presentation.overflow).toBeFocused();
	await expect(presentation.compactOverflow).toBeHidden();
	await expect(presentation.wideCustom).toBeVisible();
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	const stability = await page.evaluate((singletonDate) => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		const nodes = [
			current.host.querySelector(
				".lfc-calendar-event-overflow.lfc-is-compact"
			),
			current.host.querySelector(".lfc-calendar-grid-more"),
			current.host.querySelector(
				".lfc-calendar-event-overflow.lfc-is-wide"
			),
			current.host.querySelector("[data-test-responsive-compact-overflow]"),
			current.host.querySelector("[data-test-responsive-wide-overflow]"),
			current.host.querySelector(
				'.lfc-calendar-event-summary[data-lfc-date="2026-08-06"] ' +
					".my-responsive-marker"
			),
			current.host.querySelector(
				`.lfc-calendar-event-summary[data-lfc-date="${singletonDate}"]`
			)
		];
		const days = [...current.host.querySelectorAll(".lfc-calendar-day")];
		const weeks = [...current.host.querySelectorAll(".lfc-calendar-week")];
		return {
			allDaysStable: current.snapshot.days.every((day, index) => day === days[index]),
			allWeeksStable: current.snapshot.weeks.every((week, index) => week === weeks[index]),
			calls: {
				compactCalls: current.observations.compactCalls,
				markerCalls: current.observations.markerCalls,
				wideCalls: current.observations.wideCalls
			},
			contexts: current.observations.contexts,
			callsStable: current.observations.compactCalls === current.snapshot.calls.compactCalls &&
				current.observations.markerCalls === current.snapshot.calls.markerCalls &&
				current.observations.wideCalls === current.snapshot.calls.wideCalls,
			dayCount: days.length,
			nodesStable: current.snapshot.nodes.every((node, index) => node === nodes[index]),
			weekCount: weeks.length
		};
	}, RESPONSIVE_SINGLETON_EVENT_DATE);
	expect(stability).toEqual({
		allDaysStable: true,
		allWeeksStable: true,
		calls: initialCalls,
		callsStable: true,
		contexts: [
			{
				eventCount: 4,
				overflowCount: 3,
				text: "+3",
				variant: "compact",
				visibleEventCount: 1
			},
			{
				eventCount: 4,
				overflowCount: 2,
				text: "2 more",
				variant: "wide",
				visibleEventCount: 2
			}
		],
		dayCount: 42,
		nodesStable: true,
		weekCount: 6
	});
});

test("event replacement reestablishes equal compact slots without duplicate grid nodes", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		customOverflow: false,
		includeSingleton: true,
		renderMarker: null,
		width: 390
	});
	const dayButton = presentation.day.locator(":scope > .lfc-calendar-day-button");
	await dayButton.focus();
	await dayButton.press("F2");
	const primary = presentation.day.locator(
		'.lfc-calendar-event-summary[data-lfc-event-id="responsive-multiple-1"]'
	);
	await expect(primary).toBeFocused();

	await page.evaluate(() => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		current.calendar.setEvents([
			{
				id: "responsive-singleton",
				start: "2026-08-05T07:30",
				title: "Replacement singleton event"
			},
			...Array.from({ length: 5 }, (_value, index) => ({
				id: `responsive-multiple-${String(index + 1)}`,
				start: `2026-08-06T${String(8 + index).padStart(2, "0")}:00`,
				title: `Replacement multiple event ${String(index + 1)}`
			}))
		]);
	});
	await expect.poll(() => page.evaluate(() =>
		window.__lfcResponsiveMultipleEventFixture.calendar.getState().phase
	)).toBe("ready");
	await expect(primary).toBeFocused();
	await expect(presentation.compactDefault).toHaveText("+4");
	const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
		inspectPairedRoots: true
	});
	expectPairedCompactOverflowLayout(geometry, { direction: "ltr", layout: "stack" });
	await expectEqualCompactSlotSizing(presentation, geometry);

	const replacementState = await presentation.host.evaluate((host) => {
		const actions = [...host.querySelectorAll(
			'.lfc-calendar-day:has(> .lfc-calendar-day-button[data-lfc-date="2026-08-06"]) ' +
				".lfc-calendar-day-summaries :is(a, button)"
		)];
		return {
			actionOrder: actions.map((action) =>
				action.classList.contains("lfc-calendar-grid-more")
					? "more"
					: action.getAttribute("data-lfc-event-id")
			),
			dayCount: host.querySelectorAll(".lfc-calendar-day").length,
			weekCount: host.querySelectorAll(".lfc-calendar-week").length
		};
	});
	expect(replacementState).toEqual({
		actionOrder: ["responsive-multiple-1", "responsive-multiple-2", "more"],
		dayCount: 42,
		weekCount: 6
	});
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

test("the built-in social counter stays bare and stable across the 320px host floor", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		customOverflow: false,
		includeSingleton: true,
		renderMarker: null,
		width: 320
	});
	await expect(presentation.compactDefault).toBeVisible();
	await expect(presentation.compactDefault).toHaveText("+3");
	expectPairedCompactOverflowLayout(
		await getCompactOverflowLayoutGeometry(presentation.day, {
			inspectPairedRoots: true
		}),
		{ direction: "ltr", layout: "stack" }
	);
	const bareVisual = await presentation.compactDefault.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			backgroundColor: style.backgroundColor,
			boxShadow: style.boxShadow,
			fontWeight: Number.parseInt(style.fontWeight, 10)
		};
	});
	expect(bareVisual.backgroundColor).toBe("rgba(0, 0, 0, 0)");
	expect(bareVisual.boxShadow).toBe("none");
	expect(bareVisual.fontWeight).toBeGreaterThanOrEqual(600);

	await setResponsiveMultipleEventFixtureWidth(page, 319);
	await expect(presentation.compactDefault).toHaveText("+3");
	expectPairedCompactOverflowLayout(
		await getCompactOverflowLayoutGeometry(presentation.day, {
			inspectPairedRoots: true
		}),
		{ direction: "ltr", layout: "stack" }
	);
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);

	await setResponsiveMultipleEventFixtureWidth(page, 320);
	await page.addStyleTag({ content: "html { font-size: 200%; }" });
	await expect(presentation.compactDefault).toHaveText("+3");
	expectPairedCompactOverflowLayout(
		await getCompactOverflowLayoutGeometry(presentation.day, {
			inspectPairedRoots: true
		}),
		{ direction: "ltr", layout: "stack" }
	);
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

for (const direction of ["ltr", "rtl"]) {
	test(`compact ${direction.toUpperCase()} equal rows synchronize singleton and paired slots while reflowing`, async ({ page }) => {
		await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
		for (const weekRowSizing of [null, "equal"]) {
			const presentation = await mountResponsiveMultipleEventFixture(page, {
				compactDayMinBlockSize: "10rem",
				customOverflow: false,
				direction,
				includeSingleton: true,
				renderMarker: null,
				weekRowSizing,
				width: 660
			});
			await expect(presentation.host.locator(".lfc-calendar-weeks"))
				.toHaveAttribute("data-lfc-week-row-sizing", "equal");
			for (const [width, layout] of [
				[660, "row"],
				[412, "stack"],
				[390, "stack"],
				[320, "stack"],
				[280, "stack"]
			]) {
				await setResponsiveMultipleEventFixtureWidth(page, width);
				await expect(presentation.singletonPrimary).toBeVisible();
				await expect(presentation.compactOverflow).toBeVisible();
				await expect(presentation.compactDefault).toHaveText("+3");
				const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
					inspectPairedRoots: true
				});
				expectPairedCompactOverflowLayout(geometry, { direction, layout });
				if (width >= 320) {
					await expectEqualCompactSlotSizing(presentation, geometry);
				}
				await expectResponsiveMultipleEventFixtureNotToOverflow(page);
			}
		}
	});
}

test("content-sized compact rows retain independent singleton and paired sizing", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		customOverflow: false,
		includeSingleton: true,
		renderMarker: null,
		weekRowSizing: "content",
		width: 390
	});
	await expect(presentation.host.locator(".lfc-calendar-weeks"))
		.toHaveAttribute("data-lfc-week-row-sizing", "content");
	await expect(presentation.host.locator(".lfc-calendar-weeks"))
		.toHaveAttribute("data-lfc-grid-event-placement", "bottom");
	const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
		inspectPairedRoots: true
	});
	expectPairedCompactOverflowLayout(geometry, { direction: "ltr", layout: "stack" });
	const singleton = await getCompactPrimaryGeometry(presentation.singletonDay);
	expect(geometry.roots.primaryInlineSize - singleton.inlineSize).toBeGreaterThan(1);
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

for (const direction of ["ltr", "rtl"]) {
	test(`compact ${direction.toUpperCase()} contains the social counter at 200% text size`, async ({ page }) => {
		await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
		const presentation = await mountResponsiveMultipleEventFixture(page, {
			compactDayMinBlockSize: "10rem",
			customOverflow: false,
			direction,
			includeSingleton: true,
			renderMarker: null,
			width: 390
		});
		await page.addStyleTag({ content: "html { font-size: 200%; }" });
		await expect(presentation.compactOverflow).toBeVisible();
		await expect.poll(() => page.evaluate(() =>
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
		)).toBe(REFLOW_ROOT_FONT_SIZE);
		const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
			inspectPairedRoots: true
		});
		expectPairedCompactOverflowLayout(geometry, { direction, layout: "stack" });
		await expectEqualCompactSlotSizing(presentation, geometry);
		await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	});
}

test("the compact counter remains contained at 400% browser zoom", async ({ browserName, context, page }) => {
	test.skip(
		browserName !== "chromium",
		"Programmatic browser zoom uses Chromium CDP, which Playwright does not expose for Firefox or WebKit."
	);
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_280 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		customOverflow: false,
		includeSingleton: true,
		renderMarker: null,
		width: 320
	});
	const session = await context.newCDPSession(page);
	try {
		await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 4 });
		await expect.poll(() => page.evaluate(() => visualViewport?.scale ?? 1)).toBe(4);
		await expect(presentation.compactDefault).toHaveText("+3");
		const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
			inspectPairedRoots: true
		});
		expectPairedCompactOverflowLayout(geometry, { direction: "ltr", layout: "stack" });
		await expectEqualCompactSlotSizing(presentation, geometry);
		await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	} finally {
		await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
	}
});

test("the built-in compact counter stays visible in dark color scheme", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		customOverflow: false,
		width: 390
	});
	await page.emulateMedia({ colorScheme: "dark" });
	const visual = await presentation.compactDefault.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			color: style.color,
			display: style.display
		};
	});
	expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
	expect(visual.display).not.toBe("none");
	expect(visual.color).not.toBe("rgba(0, 0, 0, 0)");
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

for (const direction of ["ltr", "rtl"]) {
	for (const customOverflow of [false, true]) {
		const contentKind = customOverflow ? "custom" : "built-in";
		test(`a 2rem ${direction.toUpperCase()} marker stays clear of ${contentKind} compact overflow`, async ({ page }) => {
			await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
			const presentation = await mountResponsiveMultipleEventFixture(page, {
				compactDayMinBlockSize: "10rem",
				compactCustomSize: customOverflow ? "2rem" : null,
				customOverflow,
				direction,
				includeSingleton: true,
				markerSize: "2rem",
				width: 660
			});
			for (const [width, layout] of [[660, "row"], [412, "stack"], [390, "stack"]]) {
				await setResponsiveMultipleEventFixtureWidth(page, width);
				await expect(presentation.compactOverflow).toBeVisible();
				if (customOverflow) {
					await expect(presentation.compactCustom).toHaveText("+3");
				} else {
					await expect(presentation.compactDefault).toHaveText("+3");
				}
				const geometry = await getCompactOverflowLayoutGeometry(presentation.day, {
					inspectPairedRoots: true
				});
				expectPairedCompactOverflowLayout(geometry, { direction, layout });
				await expectEqualCompactSlotSizing(presentation, geometry);
				const clearance = await getCompactMarkerClearanceGeometry(
					presentation.day,
					{ customOverflow }
				);
				expect(Math.abs(clearance.markerInlineSize - 32)).toBeLessThanOrEqual(1);
				expect(Math.abs(clearance.markerBlockSize - 32)).toBeLessThanOrEqual(1);
				expect(clearance.contentContainedInRoot).toBe(true);
				expect(clearance.contentHasArea).toBe(true);
				if (customOverflow) {
					expect(Math.abs(clearance.contentInlineSize - 32)).toBeLessThanOrEqual(1);
					expect(Math.abs(clearance.contentBlockSize - 32)).toBeLessThanOrEqual(1);
				}
				expect(clearance.markerIntersectsContent).toBe(false);
				expect(clearance.markerIntersectsRoot).toBe(false);
				expect(clearance.overflowHasArea).toBe(true);
				await expectResponsiveMultipleEventFixtureNotToOverflow(page);
			}
		});
	}
}

test("a passive compact counter hit selects the day instead of activating the primary event", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		customOverflow: false,
		width: 390
	});
	const cueBox = await presentation.compactOverflow.boundingBox();
	expect(cueBox).not.toBeNull();
	await page.mouse.click(
		(cueBox?.x ?? 0) + ((cueBox?.width ?? 0) / 2),
		(cueBox?.y ?? 0) + ((cueBox?.height ?? 0) / 2)
	);
	await expect.poll(() => page.evaluate(() => ({
		daySelectCalls: window.__lfcResponsiveMultipleEventFixture.observations.daySelectCalls,
		eventActivateCalls: window.__lfcResponsiveMultipleEventFixture.observations.eventActivateCalls
	}))).toEqual({ daySelectCalls: 1, eventActivateCalls: 0 });
});

test("a missing primary marker produces a standalone unsigned total", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		customOverflow: false,
		eventCount: 1_250,
		renderMarker: false,
		width: 390
	});
	await expect(presentation.marker).toHaveCount(0);
	await expect(presentation.compactDefault).toHaveText("1.3K");
	await expectDefaultCompactSlotSize(presentation.compactOverflow);
	await expect(presentation.day.locator(":scope > .lfc-calendar-day-button"))
		.toHaveAccessibleName("Thursday, August 6, 2026, 1,250 events");
	const standaloneGeometry = await getCompactOverflowLayoutGeometry(presentation.day);
	expectCompactOverflowAtBlockEnd(standaloneGeometry);
	expect(standaloneGeometry.targetInlineCenterDelta).toBeLessThanOrEqual(1);
	expect(standaloneGeometry.compactInlineCenterDelta).toBeLessThanOrEqual(1);
	await expect(presentation.cluster).not.toHaveClass(/lfc-has-compact-primary-visual/u);
	const compactContext = await page.evaluate(() =>
		window.__lfcResponsiveMultipleEventFixture.observations.contexts.find(
			(context) => context.variant === "compact"
		)
	);
	expect(compactContext).toEqual({
		eventCount: 1_250,
		overflowCount: 1_250,
		text: "1.3K",
		variant: "compact",
		visibleEventCount: 0
	});
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

test("a single event renders no overflow variant", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		customOverflow: false,
		eventCount: 1,
		width: 390
	});
	await expect(presentation.compactOverflow).toHaveCount(0);
	await expect(presentation.wideOverflow).toHaveCount(0);
	await expect(presentation.overflow).toHaveCount(0);
	await expectDefaultCompactSlotSize(presentation.day.locator(
		".lfc-calendar-event-summary.lfc-is-compact-primary"
	));
	expect(await page.evaluate(() => ({
		compactCalls: window.__lfcResponsiveMultipleEventFixture.observations.compactCalls,
		wideCalls: window.__lfcResponsiveMultipleEventFixture.observations.wideCalls
	}))).toEqual({ compactCalls: 0, wideCalls: 0 });
});

test("a zero grid-event cap uses the compact overflow action without a duplicate cue", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		compactDayMinBlockSize: "10rem",
		maxGridEventsPerDay: 0,
		width: 390
	});
	await expect(presentation.day.locator(".lfc-calendar-event-summary")).toHaveCount(0);
	await expect(presentation.day.locator(
		":scope > .lfc-calendar-day-summaries > .lfc-calendar-event-overflow-cluster " +
			".lfc-calendar-event-overflow.lfc-is-compact"
	)).toHaveCount(0);
	await expect(presentation.overflow).toHaveClass(/lfc-is-compact-primary/u);
	await expect(presentation.overflow).toBeVisible();
	await expectDefaultCompactSlotSize(presentation.overflow);
	await expect(presentation.compactOverflow).toHaveCount(1);
	await expect(presentation.compactCustom).toBeVisible();
	await expect(presentation.compactCustom).toHaveText("4");
	await expect(presentation.wideOverflow).toBeHidden();
	await expect(presentation.overflow).toHaveAccessibleName(/View 4 more events/u);
	const compactActionGeometry = await getCompactOverflowLayoutGeometry(presentation.day, {
		targetSelector: ".lfc-calendar-grid-more.lfc-is-compact-primary"
	});
	expectCompactOverflowAtBlockEnd(compactActionGeometry);
	expect(compactActionGeometry.targetInlineCenterDelta).toBeLessThanOrEqual(1);
	expect(compactActionGeometry.compactInlineCenterDelta).toBeLessThanOrEqual(1);
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);

	const previousDay = presentation.host.locator(
		'.lfc-calendar-day-button[data-lfc-date="2026-08-05"]'
	);
	await previousDay.click();
	const selectionCalls = await page.evaluate(() =>
		window.__lfcResponsiveMultipleEventFixture.observations.daySelectCalls
	);
	const compactBox = await presentation.compactOverflow.boundingBox();
	expect(compactBox).not.toBeNull();
	await page.mouse.click(
		(compactBox?.x ?? 0) + ((compactBox?.width ?? 0) / 2),
		(compactBox?.y ?? 0) + ((compactBox?.height ?? 0) / 2)
	);
	await expect(presentation.day).toHaveAttribute("aria-selected", "true");
	await expect.poll(() => page.evaluate(() => {
		const host = window.__lfcResponsiveMultipleEventFixture.host;
		const agenda = host.querySelector(".lfc-calendar-agenda");
		const headingId = agenda?.getAttribute("aria-labelledby");
		return {
			daySelectCalls: window.__lfcResponsiveMultipleEventFixture.observations.daySelectCalls,
			focusedAgendaHeading: headingId !== null && document.activeElement ===
				document.getElementById(headingId)
		};
	})).toEqual({ daySelectCalls: selectionCalls, focusedAgendaHeading: true });

	for (const key of ["Enter", "Space"]) {
		await previousDay.click();
		const keyboardSelectionCalls = await page.evaluate(() =>
			window.__lfcResponsiveMultipleEventFixture.observations.daySelectCalls
		);
		const targetDayButton = presentation.day.locator(
			":scope > .lfc-calendar-day-button"
		);
		await targetDayButton.focus();
		await page.keyboard.press("F2");
		await expect(presentation.overflow).toBeFocused();
		await page.keyboard.press(key);
		await expect(presentation.day).toHaveAttribute("aria-selected", "true");
		await expect.poll(() => page.evaluate(() => {
			const current = window.__lfcResponsiveMultipleEventFixture;
			const agenda = current.host.querySelector(".lfc-calendar-agenda");
			const headingId = agenda?.getAttribute("aria-labelledby");
			return {
				daySelectCalls: current.observations.daySelectCalls,
				eventActivateCalls: current.observations.eventActivateCalls,
				focusedAgendaHeading: headingId !== null && document.activeElement ===
					document.getElementById(headingId)
			};
		})).toEqual({
			daySelectCalls: keyboardSelectionCalls,
			eventActivateCalls: 0,
			focusedAgendaHeading: true
		});
	}

	await setResponsiveMultipleEventFixtureWidth(page, 768);
	await expect(presentation.overflow).toBeVisible();
	await expect(presentation.compactOverflow).toBeHidden();
	await expect(presentation.wideCustom).toBeVisible();
	await expect(presentation.wideCustom).toHaveText("Wide 4 more");
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});
