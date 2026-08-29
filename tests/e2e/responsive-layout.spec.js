import { expect, test } from "@playwright/test";

import {
	expectExampleReady,
	gridEventActions
} from "./helpers.js";

const COMPACT_VIEWPORT_HEIGHT = 1_100;
const COMPACT_ROW_MINIMUM = 60;
const COMPACT_ROW_MAXIMUM = 96;
const PRIMARY_TARGET_MINIMUM = 44;
const GRID_TARGET_MINIMUM = 24;
const REFLOW_ROOT_FONT_SIZE = 32;
const RESPONSIVE_MULTIPLE_EVENT_FIXTURE = "#lfc-responsive-multiple-event-fixture";
const SEPTEMBER_TITLE = "September 2026";
const SEPTEMBER_COMPACT_TITLE = "Sep 2026";
const SEPTEMBER_TITLE_BUTTON_LABEL =
	"Choose schedule month and year, currently September 2026";
const LONG_MONTH_TITLE =
	"September in the exceptionally verbose regional calendar for the year 2026";
const LONG_COMPACT_MONTH_TITLE =
	"Sep in the exceptionally verbose regional calendar 2026";
const LONG_MONTH_TITLE_BUTTON_LABEL =
	`Choose schedule month and year, currently ${LONG_MONTH_TITLE}`;
const EXACT_HOST_WIDTH_CASES = Object.freeze([
	{ agendaReflows: true, compact: true, narrowWeekdays: true, toolbarLayout: "three-row", width: 280 },
	{ agendaReflows: true, compact: true, narrowWeekdays: true, toolbarLayout: "three-row", width: 320 },
	{ agendaReflows: true, compact: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 340 },
	{ agendaReflows: true, compact: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 360 },
	{ agendaReflows: true, compact: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 375 },
	{ agendaReflows: false, compact: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 390 },
	{ agendaReflows: false, compact: true, narrowWeekdays: false, toolbarLayout: "two-row", width: 412 },
	{ agendaReflows: false, compact: false, narrowWeekdays: false, toolbarLayout: "wide", width: 768 }
]);

test.use({ bypassCSP: true });

async function expectNoHorizontalOverflow(page) {
	const overflow = await page.evaluate(() => {
		const host = document.querySelector("[data-example-calendar]");
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

async function setExactCalendarHostWidth(page, width) {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.addStyleTag({
		content: `.advanced-example-calendar { inline-size: ${String(width)}px; justify-self: start; }`
	});
	const renderedWidth = await page.locator("[data-example-calendar]").evaluate((host) =>
		host.getBoundingClientRect().width
	);
	expect(renderedWidth).toBe(width);
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
		page.locator("[data-example-toolbar-end] input").first()
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

async function showSeptember(page) {
	await page.getByRole("button", { name: "Later month" }).click();
	await expect(page.locator("[data-example-calendar]")).not.toHaveAttribute("aria-busy", "true");
	await expect(page.locator(".lfc-calendar-title-label-full")).toHaveText(SEPTEMBER_TITLE);
	await expect(page.locator(".lfc-calendar-title-label-compact"))
		.toHaveAttribute("data-lfc-compact-title", SEPTEMBER_COMPACT_TITLE);
}

async function expectSingleLineMonthTitle(
	page,
	{
		buttonLabel = SEPTEMBER_TITLE_BUTTON_LABEL,
		compactTitle = SEPTEMBER_COMPACT_TITLE,
		overflowExpected = false,
		title = SEPTEMBER_TITLE
	} = {}
) {
	const titleLabelFull = page.locator(".lfc-calendar-title-label-full");
	const titleLabelCompact = page.locator(".lfc-calendar-title-label-compact");
	await expect(titleLabelFull).toHaveText(title);
	await expect(titleLabelCompact).toHaveText("");
	await expect(titleLabelCompact).toHaveAttribute("aria-hidden", "true");
	await expect(titleLabelCompact).toHaveAttribute("data-lfc-compact-title", compactTitle);

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
	expect(metrics.activeText).toBe(metrics.compactVisible ? compactTitle : title);
	expect(metrics.clientWidth).toBeGreaterThan(0);
	expect(metrics.lineHeight).toBeGreaterThan(0);
	expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
	expect(metrics.textWrap).toBe("nowrap");
	expect(metrics.whiteSpace).toBe("nowrap");
	if (metrics.compactVisible) {
		expect(metrics.pseudoContent).toContain(compactTitle);
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

async function mountResponsiveMultipleEventFixture(
	page,
	{ direction = "ltr", markerSize = "1.25rem", maxGridEventsPerDay = 2, width = 768 } = {}
) {
	await expectExampleReady(page, "/examples/advanced/");
	await page.addStyleTag({
		content: `
			.lfc-responsive-test-marker {
				align-items: center;
				block-size: var(--lfc-responsive-test-marker-size);
				border: 0.125rem solid currentcolor;
				border-radius: 50%;
				display: inline-grid;
				inline-size: var(--lfc-responsive-test-marker-size);
				justify-items: center;
				position: relative;
			}
			.lfc-responsive-test-satellite {
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
		const { createCalendar } = await import("/dist/index.js");
		const fixture = document.createElement("section");
		fixture.id = "lfc-responsive-multiple-event-fixture";
		fixture.style.inlineSize = "fit-content";
		const host = document.createElement("div");
		host.dataset["responsiveMultipleEventHost"] = "";
		host.dir = fixtureOptions.direction;
		host.style.inlineSize = `${String(fixtureOptions.width)}px`;
		host.style.setProperty("--lfc-responsive-test-marker-size", fixtureOptions.markerSize);
		fixture.append(host);
		document.body.prepend(fixture);
		const observations = { gridOverflowCalls: 0, multipleEventCalls: 0 };
		const events = Array.from({ length: 4 }, (_value, index) => Object.freeze({
			id: `responsive-multiple-${String(index + 1)}`,
			start: `2026-08-06T${String(9 + index).padStart(2, "0")}:00`,
			title: `Responsive multiple event ${String(index + 1)}`
		}));
		const calendar = createCalendar(host, {
			events,
			renderHooks: [{
				id: "responsive-multiple-event-fixture",
				renderGridOverflowContent: ({ document: ownerDocument, text }) => {
					observations.gridOverflowCalls += 1;
					const custom = ownerDocument.createElement("span");
					custom.dataset["responsiveWideOverflow"] = "";
					custom.textContent = `Wide ${text}`;
					return custom;
				},
				renderEventMarker: ({ document: ownerDocument }) => {
					const marker = ownerDocument.createElement("span");
					marker.className = "lfc-responsive-test-marker";
					marker.setAttribute("aria-hidden", "true");
					const satellite = ownerDocument.createElement("span");
					satellite.className = "lfc-responsive-test-satellite";
					marker.append(satellite);
					return marker;
				},
				renderMultipleEventIndicator: () => {
					observations.multipleEventCalls += 1;
					return undefined;
				}
			}],
			initialDate: "2026-08-06",
			maxGridEventsPerDay: fixtureOptions.maxGridEventsPerDay,
			onEventActivate: () => undefined
		});
		calendar.render();
		Object.defineProperty(window, "__lfcResponsiveMultipleEventFixture", {
			configurable: true,
			value: { calendar, fixture, host, observations }
		});
	}, { direction, markerSize, maxGridEventsPerDay, width });
	await expect.poll(() => page.evaluate(() =>
		window.__lfcResponsiveMultipleEventFixture.calendar.getState().phase
	)).toBe("ready");
	return responsiveMultipleEventFixture(page);
}

async function getResponsiveMultipleEventGeometry(day) {
	return day.evaluate((element) => {
		const indicator = element.querySelector(".lfc-calendar-multiple-event-indicator");
		const marker = element.querySelector(".lfc-responsive-test-marker");
		const satellite = element.querySelector(".lfc-responsive-test-satellite");
		if (!(indicator instanceof HTMLElement) || !(marker instanceof HTMLElement) ||
			!(satellite instanceof HTMLElement)) {
			throw new Error("Expected the compact multiple-event geometry probes.");
		}
		const dayBox = element.getBoundingClientRect();
		const indicatorBox = indicator.getBoundingClientRect();
		const markerBox = marker.getBoundingClientRect();
		const satelliteBox = satellite.getBoundingClientRect();
		const computedDirection = getComputedStyle(element).direction;
		const intersects = (first, second) => first.left < second.right &&
			first.right > second.left && first.top < second.bottom && first.bottom > second.top;
		return {
			containedInDay: indicatorBox.left >= dayBox.left - 1 &&
				indicatorBox.right <= dayBox.right + 1 &&
				indicatorBox.top >= dayBox.top - 1 &&
				indicatorBox.bottom <= dayBox.bottom + 1,
			direction: computedDirection,
			indicatorOnRight: indicatorBox.left >= markerBox.right - 1,
			intersectsMarker: intersects(indicatorBox, markerBox),
			intersectsSatellite: intersects(indicatorBox, satelliteBox),
			satelliteOnInlineEnd: computedDirection === "rtl"
				? satelliteBox.left < markerBox.left
				: satelliteBox.right > markerBox.right
		};
	});
}

function responsiveMultipleEventFixture(page) {
	const fixture = page.locator(RESPONSIVE_MULTIPLE_EVENT_FIXTURE);
	const host = fixture.locator("[data-responsive-multiple-event-host]");
	const day = host.locator(
		'.lfc-calendar-day:has(> .lfc-calendar-day-button[data-lfc-date="2026-08-06"])'
	);
	const indicator = day.locator(
		":scope > .lfc-calendar-day-summaries > .lfc-calendar-multiple-event-indicator"
	);
	const overflow = day.locator(
		":scope > .lfc-calendar-day-summaries > .lfc-calendar-grid-more"
	);
	return {
		customOverflow: overflow.locator(":scope > .lfc-calendar-grid-more-custom-content"),
		day,
		defaultOverflow: overflow.locator(":scope > .lfc-calendar-grid-more-default-content"),
		fixture,
		host,
		indicator,
		marker: day.locator(".lfc-calendar-event-summary.lfc-is-compact-primary .lfc-responsive-test-marker"),
		overflow,
		satellite: day.locator(".lfc-calendar-event-summary.lfc-is-compact-primary .lfc-responsive-test-satellite")
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
		await expect(toolbar).toHaveCSS("display", widthCase.compact ? "grid" : "flex");
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
		if (widthCase.compact) {
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
		if (widthCase.width <= 20 * 16) {
			await expect(page.locator(".lfc-calendar-title-label-full"))
				.toHaveCSS("position", "absolute");
			await expect(page.locator(".lfc-calendar-title-label-full"))
				.toHaveCSS("clip-path", "inset(50%)");
			await expect(page.locator(".lfc-calendar-title-label-compact")).toBeVisible();
		} else {
			await expect(page.locator(".lfc-calendar-title-label-full")).toBeVisible();
			await expect(page.locator(".lfc-calendar-title-label-full"))
				.toHaveCSS("position", "static");
			await expect(page.locator(".lfc-calendar-title-label-compact")).toBeHidden();
		}
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

for (const width of [412, 390]) {
	test(`compact ${String(width)}px layout grows rows intrinsically and matches DOM focus order`, async ({ page }) => {
		await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width });
		await expectExampleReady(page, "/examples/advanced/");
		await page.addStyleTag({
			content: ".advanced-example-calendar { --lfc-day-min-block-size: 12rem; }"
		});

		const hostWidth = await page.locator("[data-example-calendar]").evaluate((host) =>
			host.getBoundingClientRect().width
		);
		expect(hostWidth).toBeGreaterThan(20 * 16);
		expect(hostWidth).toBeLessThanOrEqual(42 * 16);

		await expect(page.locator(".lfc-calendar-toolbar")).toHaveCSS("display", "grid");
		await expectCompactToolbarVisualLayout(page, "two-row");

		const customProperty = await page.locator("[data-example-calendar]").evaluate((host) =>
			getComputedStyle(host).getPropertyValue("--lfc-day-min-block-size").trim()
		);
		expect(customProperty).toBe("12rem");
		const weekHeights = await page.locator(".lfc-calendar-week").evaluateAll((weeks) =>
			weeks.map((week) => week.getBoundingClientRect().height)
		);
		expect(weekHeights).toHaveLength(6);
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
		content: ".advanced-example-calendar { --lfc-grid-event-min-block-size: 3rem; }"
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

test("focused later compact actions retain a keyboard-operable target for minimal content", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");

	const selectedCell = page.getByRole("grid").locator(
		'[role="gridcell"][aria-selected="true"]'
	);
	const dayButton = selectedCell.locator(":scope > .lfc-calendar-day-button");
	const actions = selectedCell.locator(
		":scope > .lfc-calendar-day-summaries > :is(a, button)"
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
	await expectNoHorizontalOverflow(page);

	await laterAction.press("Enter");
	await expect(page.locator("[data-example-event-dialog]")).toBeVisible();
});

test("compact layout applies the public day-padding token to day and event geometry", async ({ page }) => {
	await setExactCalendarHostWidth(page, 375);
	await page.addStyleTag({
		content: ".advanced-example-calendar { --lfc-day-padding: 0.75rem; }"
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
			actionBlockInset: actionBox.top - cellBox.top,
			actionBlockSize: actionBox.height,
			actionInlineSize: actionBox.width,
			actionPadding: actionStyle.paddingBlockStart,
			buttonBlockPadding: buttonStyle.paddingBlockStart,
			buttonInlinePadding: buttonStyle.paddingInlineStart,
			dayNumberBlockInset: dayNumberBox.top - cellBox.top,
			summariesInlinePadding: summariesStyle.paddingInlineStart,
			summariesMargin: summariesStyle.marginBlockStart
		};
	});

	expect(metrics.actionPadding).toBe("12px");
	expect(metrics.buttonBlockPadding).toBe("12px");
	expect(metrics.buttonInlinePadding).toBe("12px");
	expect(metrics.summariesInlinePadding).toBe("0px");
	expect(metrics.summariesMargin).toBe("46px");
	expect(Math.abs(metrics.dayNumberBlockInset - 12)).toBeLessThanOrEqual(1);
	expect(Math.abs(metrics.actionBlockInset - 46)).toBeLessThanOrEqual(1);
	expect(Math.abs(metrics.actionInlineSize - PRIMARY_TARGET_MINIMUM)).toBeLessThanOrEqual(1);
	expect(Math.abs(metrics.actionBlockSize - PRIMARY_TARGET_MINIMUM)).toBeLessThanOrEqual(1);
	await expectNoHorizontalOverflow(page);
});

test("sub-20rem calendar places title and direction controls before Today", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 320 });
	await expectExampleReady(page, "/examples/advanced/");

	const hostWidth = await page.locator("[data-example-calendar]").evaluate((host) =>
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
	await page.locator("[data-example-direction]").check();
	await page.addStyleTag({ content: "html { font-size: 200%; }" });

	const directionAndReflow = await page.locator("[data-example-calendar]").evaluate((host) => {
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
		focusMinimum: 4,
		label: "increased contrast",
		media: { contrast: "more", forcedColors: "none" },
		query: "(prefers-contrast: more)"
	},
	{
		eventBoundaryMinimum: 1,
		focusMinimum: 3,
		label: "forced colors",
		media: { contrast: "no-preference", forcedColors: "active" },
		query: "(forced-colors: active)"
	}
]) {
	test(`compact ${preference.label} keeps focus, boundaries, and targets visible`, async ({ page }) => {
		await page.emulateMedia(preference.media);
		await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
		await expectExampleReady(page, "/examples/advanced/");

		expect(await page.evaluate((query) => matchMedia(query).matches, preference.query)).toBe(true);
		await page.locator(".lfc-calendar-nav-button-next").focus();
		await page.keyboard.press("Tab");
		const titleButton = page.locator(".lfc-calendar-title-button");
		await expect(titleButton).toBeFocused();

		const visuals = await page.evaluate(() => {
			const title = document.querySelector(".lfc-calendar-title-button");
			const grid = document.querySelector(".lfc-calendar-grid");
			const event = document.querySelector(".lfc-calendar-agenda-event");
			if (!(title instanceof HTMLElement) || !(grid instanceof HTMLElement) ||
				!(event instanceof HTMLElement)) {
				throw new Error("Expected the title, grid, and event boundary probes.");
			}
			const titleStyle = getComputedStyle(title);
			const gridStyle = getComputedStyle(grid);
			const eventStyle = getComputedStyle(event);
			return {
				eventBoundaryColor: eventStyle.borderBlockStartColor,
				eventBoundaryStyle: eventStyle.borderBlockStartStyle,
				eventBoundaryWidth: Number.parseFloat(eventStyle.borderBlockStartWidth),
				focusColor: titleStyle.outlineColor,
				focusStyle: titleStyle.outlineStyle,
				focusWidth: Number.parseFloat(titleStyle.outlineWidth),
				gridBoundaryColor: gridStyle.borderBlockStartColor,
				gridBoundaryStyle: gridStyle.borderBlockStartStyle,
				gridBoundaryWidth: Number.parseFloat(gridStyle.borderBlockStartWidth)
			};
		});

		expect(visuals.focusStyle).toBe("solid");
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
}

test("application toolbar disclosure toggles without runtime or focus churn", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 390 });
	await expectExampleReady(page, "/examples/advanced/");
	await page.evaluate(() => {
		const host = document.querySelector("[data-example-calendar]");
		const toolbar = document.querySelector(".lfc-calendar-toolbar");
		const toolbarEnd = document.querySelector(".lfc-calendar-toolbar-end");
		const grid = document.querySelector(".lfc-calendar-grid");
		if (!(host instanceof HTMLElement) || !(toolbar instanceof HTMLElement) ||
			!(toolbarEnd instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
			throw new Error("Expected stable calendar regions.");
		}

		const disclosure = document.createElement("details");
		disclosure.dataset["responsiveDisclosure"] = "";
		disclosure.open = true;
		const summary = document.createElement("summary");
		summary.textContent = "Application options";
		const content = document.createElement("span");
		content.dataset["responsiveDisclosureContent"] = "";
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
			sourceRange: host.dataset["exampleSourceRange"]
		};
		Object.defineProperty(window, "__lfcToolbarDisclosureSnapshot", { value: snapshot });
		sourceObserver.observe(host, {
			attributeFilter: ["data-example-source-range"],
			attributes: true
		});
	});

	const disclosure = page.locator("[data-responsive-disclosure]");
	const summary = disclosure.locator("summary");
	const content = disclosure.locator("[data-responsive-disclosure-content]");
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
			document.querySelector("[data-example-calendar]"),
			document.querySelector(".lfc-calendar-toolbar"),
			document.querySelector(".lfc-calendar-toolbar-end"),
			document.querySelector("[data-responsive-disclosure]"),
			document.querySelector("[data-responsive-disclosure] summary"),
			document.querySelector("[data-responsive-disclosure-content]"),
			document.querySelector(".lfc-calendar-grid")
		];
		snapshot.sourceObserver.disconnect();
		return {
			allNodesStable: snapshot.nodes.every((node, index) => node === currentNodes[index]),
			sourceMutations: snapshot.sourceMutations,
			sourceRangeStable: snapshot.sourceRange ===
				document.querySelector("[data-example-calendar]")?.getAttribute(
					"data-example-source-range"
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
		const legend = document.querySelector("[data-example-toolbar-end] legend");
		if (!(today instanceof HTMLButtonElement) || !(legend instanceof HTMLElement)) {
			throw new Error("Expected compact toolbar content.");
		}
		today.textContent = "Return to the current schedule date";
		legend.textContent = "Choose the event categories shown in this calendar";
		for (const label of document.querySelectorAll("[data-example-toolbar-end] label")) {
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
			.advanced-example-event-marker { position: relative; }
			[data-example-overflow-probe] {
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
	await action.locator(".advanced-example-event-marker").evaluate((marker) => {
		const probe = document.createElement("span");
		probe.setAttribute("data-example-overflow-probe", "");
		marker.append(probe);
	});

	const result = await action.evaluate((eventAction) => {
		const packageMarker = eventAction.querySelector(".lfc-calendar-event-marker");
		const leading = eventAction.querySelector(".lfc-calendar-event-leading");
		const probe = eventAction.querySelector("[data-example-overflow-probe]");
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
			"[data-example-calendar]",
			".lfc-calendar-toolbar",
			".lfc-calendar-title-button",
			".lfc-calendar-grid",
			'[data-example-event-surface="grid-summary"]'
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
			attributeFilter: ["data-example-source-range"],
			attributes: true
		});
		stateObserver.observe(document.documentElement, {
			attributeFilter: ["data-example-phase", "data-example-ready"],
			attributes: true
		});
		for (const stateElement of document.querySelectorAll("[data-example-state-phase], [data-example-state-month], [data-example-state-selected], [data-example-state-range], [data-example-state-issues]")) {
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
			document.querySelector("[data-example-calendar]"),
			document.querySelector(".lfc-calendar-toolbar"),
			document.querySelector(".lfc-calendar-title-button"),
			document.querySelector(".lfc-calendar-grid"),
			document.querySelector('[data-example-event-surface="grid-summary"]')
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

test("multiple-event presentations cross compact widths without DOM or hook churn", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page);
	await expect(presentation.indicator).toBeHidden();
	await expect(presentation.customOverflow).toBeVisible();
	await expect(presentation.customOverflow).toHaveAttribute("aria-hidden", "true");
	await expect(presentation.customOverflow).toHaveText("Wide 2 more");
	await expect(presentation.defaultOverflow).toBeHidden();
	await expect(presentation.overflow).toHaveAccessibleName(/View 2 more events/u);
	await page.evaluate(() => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		current.snapshot = {
			calls: { ...current.observations },
			nodes: [
				current.host.querySelector(".lfc-calendar-multiple-event-indicator"),
				current.host.querySelector(".lfc-calendar-grid-more"),
				current.host.querySelector(".lfc-calendar-grid-more-custom-content"),
				current.host.querySelector(".lfc-calendar-grid-more-default-content")
			]
		};
	});

	await setResponsiveMultipleEventFixtureWidth(page, 412);
	await presentation.day.locator(":scope > .lfc-calendar-day-button").focus();
	await page.keyboard.press("F2");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await expect(presentation.overflow).toBeFocused();
	for (const width of [412, 320, 280]) {
		await setResponsiveMultipleEventFixtureWidth(page, width);
		await expect(presentation.indicator).toBeVisible();
		await expect(presentation.indicator).toHaveAttribute("aria-hidden", "true");
		await expect(presentation.indicator).toHaveCSS("pointer-events", "none");
		await expect(presentation.indicator.locator(
			":scope > .lfc-calendar-multiple-event-indicator-icon"
		)).toHaveCount(1);
		await expect(presentation.customOverflow).toBeHidden();
		await expect(presentation.defaultOverflow).toBeVisible();
		await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	}

	await setResponsiveMultipleEventFixtureWidth(page, 768);
	await expect(presentation.overflow).toBeFocused();
	await expect(presentation.customOverflow).toBeHidden();
	await expect(presentation.defaultOverflow).toBeVisible();
	await presentation.day.locator(":scope > .lfc-calendar-day-button").focus();
	await expect(presentation.customOverflow).toBeVisible();
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	const stability = await page.evaluate(() => {
		const current = window.__lfcResponsiveMultipleEventFixture;
		const nodes = [
			current.host.querySelector(".lfc-calendar-multiple-event-indicator"),
			current.host.querySelector(".lfc-calendar-grid-more"),
			current.host.querySelector(".lfc-calendar-grid-more-custom-content"),
			current.host.querySelector(".lfc-calendar-grid-more-default-content")
		];
		return {
			calls: current.observations,
			callsStable: Object.entries(current.snapshot.calls).every(
				([name, count]) => current.observations[name] === count
			),
			nodesStable: current.snapshot.nodes.every((node, index) => node === nodes[index])
		};
	});
	expect(stability).toEqual({
		calls: { gridOverflowCalls: 1, multipleEventCalls: 1 },
		callsStable: true,
		nodesStable: true
	});
});

test("the 320px host floor keeps the full fan before sub-floor compaction", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, { width: 320 });
	await expect(presentation.indicator).toHaveCSS("max-inline-size", "35%");

	await setResponsiveMultipleEventFixtureWidth(page, 319);
	await expect(presentation.indicator).toHaveCSS("max-inline-size", "20%");
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);

	await setResponsiveMultipleEventFixtureWidth(page, 320);
	await page.addStyleTag({ content: "html { font-size: 200%; }" });
	await expect(presentation.indicator).toHaveCSS("max-inline-size", "35%");
	expect(await getResponsiveMultipleEventGeometry(presentation.day)).toEqual({
		containedInDay: true,
		direction: "ltr",
		indicatorOnRight: true,
		intersectsMarker: false,
		intersectsSatellite: false,
		satelliteOnInlineEnd: true
	});
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});

for (const direction of ["ltr", "rtl"]) {
	for (const markerSize of ["1.25rem", "2rem"]) {
		test(`compact ${direction.toUpperCase()} keeps the default cue clear of a ${markerSize} marker and its inline-end satellite`, async ({ page }) => {
			await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
			const presentation = await mountResponsiveMultipleEventFixture(page, {
				direction,
				markerSize,
				width: 412
			});
			for (const width of [412, 320, 280]) {
				await setResponsiveMultipleEventFixtureWidth(page, width);
				await expect(presentation.indicator).toBeVisible();
				expect(await getResponsiveMultipleEventGeometry(presentation.day)).toEqual({
					containedInDay: true,
					direction,
					indicatorOnRight: true,
					intersectsMarker: false,
					intersectsSatellite: false,
					satelliteOnInlineEnd: true
				});
				await expectResponsiveMultipleEventFixtureNotToOverflow(page);
			}
		});
	}
}

for (const direction of ["ltr", "rtl"]) {
	test(`compact ${direction.toUpperCase()} contains the multiple-event cue at 200% text size`, async ({ page }) => {
		await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
		const presentation = await mountResponsiveMultipleEventFixture(page, {
			direction,
			width: 390
		});
		await page.addStyleTag({ content: "html { font-size: 200%; }" });
		await expect(presentation.indicator).toBeVisible();
		await expect.poll(() => page.evaluate(() =>
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
		)).toBe(REFLOW_ROOT_FONT_SIZE);
		expect(await getResponsiveMultipleEventGeometry(presentation.day)).toEqual({
			containedInDay: true,
			direction,
			indicatorOnRight: true,
			intersectsMarker: false,
			intersectsSatellite: false,
			satelliteOnInlineEnd: true
		});
		await expectResponsiveMultipleEventFixtureNotToOverflow(page);
	});
}

test("a zero grid-event cap uses the compact overflow action without a duplicate cue", async ({ page }) => {
	await page.setViewportSize({ height: COMPACT_VIEWPORT_HEIGHT, width: 1_100 });
	const presentation = await mountResponsiveMultipleEventFixture(page, {
		maxGridEventsPerDay: 0,
		width: 390
	});
	await expect(presentation.day.locator(".lfc-calendar-event-summary")).toHaveCount(0);
	await expect(presentation.indicator).toBeHidden();
	await expect(presentation.indicator.locator(
		":scope > .lfc-calendar-multiple-event-indicator-icon"
	)).toHaveCount(1);
	await expect(presentation.overflow).toHaveClass(/lfc-is-compact-primary/u);
	await expect(presentation.overflow).toBeVisible();
	await expect(presentation.customOverflow).toBeHidden();
	await expect(presentation.defaultOverflow).toBeVisible();
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);

	await setResponsiveMultipleEventFixtureWidth(page, 768);
	await expect(presentation.overflow).toBeVisible();
	await expect(presentation.customOverflow).toBeHidden();
	await expect(presentation.defaultOverflow).toBeVisible();
	await expectResponsiveMultipleEventFixtureNotToOverflow(page);
});
