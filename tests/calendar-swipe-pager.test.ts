import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createCalendar, type Calendar } from "../src/index.js";
import {
	createDom,
	dispatchClick,
	dispatchPointer,
	installDom,
	installPagerGeometry,
	waitFor
} from "./helpers/dom.js";

interface PagerDom {
	readonly grid: HTMLElement;
	readonly nextLane: HTMLElement;
	readonly previousLane: HTMLElement;
	readonly viewport: HTMLElement;
}

interface SourceRequest {
	readonly end: string;
	readonly start: string;
}

let syntheticWheelTime = 0;

void test("native pager exposes hidden labeled lanes around one live 42-cell grid", async (context) => {
	const { dom, host } = setupDom(context);
	const requests: SourceRequest[] = [];
	const calendar = createCalendar(host, {
		events: ({ end, start }) => {
			requests.push({ end, start });
			return [];
		},
		initialDate: "2026-08-06",
		locale: "en-US"
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	assert.equal(host.getAttribute("data-lfc-swipe-enabled"), "true");
	assert.deepEqual([...pager.viewport.children], [
		pager.previousLane, pager.grid, pager.nextLane
	]);
	assert.equal(pager.viewport.tabIndex, -1);
	assert.equal(pager.previousLane.getAttribute("aria-hidden"), "true");
	assert.equal(pager.nextLane.getAttribute("aria-hidden"), "true");
	assert.equal(pager.grid.getAttribute("role"), "grid");
	assert.equal(pager.viewport.querySelectorAll("[role='grid']").length, 1);
	assert.equal(pager.grid.querySelectorAll(".lfc-calendar-day").length, 42);
	assert.equal(pager.previousLane.querySelector("[role='grid']"), null);
	assert.equal(pager.nextLane.querySelector("[role='grid']"), null);
	assert.equal(pager.previousLane.hasAttribute("data-lfc-page-available"), true);
	assert.equal(pager.nextLane.hasAttribute("data-lfc-page-available"), true);
	const previousLabels = requireLaneLabels(pager.previousLane);
	const nextLabels = requireLaneLabels(pager.nextLane);
	assert.equal(previousLabels.full.textContent, "July 2026");
	assert.equal(previousLabels.compact.textContent, "Jul 2026");
	assert.equal(nextLabels.full.textContent, "September 2026");
	assert.equal(nextLabels.compact.textContent, "Sep 2026");
	assert.equal(requests.length, 1, "Side lanes must not prefetch adjacent grids or data.");
	assert.equal(rangeLength(requests[0]), 42);
	assert.equal(host.matches("[style]") || host.querySelector("[style]") !== null, false);

	setPagerScroll(dom, pager.viewport, geometry.centerOffset + 20);
	assert.equal(host.getAttribute("data-lfc-swipe-state"), "scrolling");
	dispatchScrollEnd(dom, pager.viewport);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(requests.length, 1, "Settling back to the current snap must not request data.");
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
});

void test("scrollend resolves immediately and the watchdog recovers a missing terminal event", async (context) => {
	const { dom, host } = setupDom(context);
	Object.defineProperty(dom.window.HTMLElement.prototype, "onscrollend", {
		configurable: true,
		value: null,
		writable: true
	});
	const requests: SourceRequest[] = [];
	const calendar = createCalendar(host, {
		events: ({ end, start }) => {
			requests.push({ end, start });
			return [];
		},
		initialDate: "2026-08-06"
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	assert.equal(requests.length, 1, "Scrolling alone must not request the destination month.");
	dispatchScrollEnd(dom, pager.viewport);
	await waitForReady(calendar);
	assert.equal(calendar.getState().displayedMonth.month, 9);
	assert.equal(requests.length, 2);
	assert.equal(rangeLength(requests[1]), 42);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	dispatchScrollEnd(dom, pager.viewport);
	dispatchScrollEnd(dom, pager.viewport);
	assert.equal(calendar.getState().displayedMonth.month, 9);
	assert.equal(requests.length, 2, "Repeated terminal events must not consume another page.");

	setPagerScroll(dom, pager.viewport, geometry.previousOffset);
	assert.equal(requests.length, 2);
	await waitFor(() => calendar.getState().displayedMonth.month === 8, "supported pager watchdog");
	await waitForReady(calendar);
	assert.equal(requests.length, 3, "The watchdog must recover a missing scrollend.");
	dispatchScrollEnd(dom, pager.viewport);
	dispatchScrollEnd(dom, pager.viewport);
	await delay(150);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(requests.length, 3);
	assert.equal(rangeLength(requests[2]), 42);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
});

void test("hosts without scrollend resolve a settled endpoint after 120ms idle", async (context) => {
	const { dom, host } = setupDom(context);
	Reflect.deleteProperty(dom.window.HTMLElement.prototype, "onscrollend");
	assert.equal("onscrollend" in host, false);
	const requests: SourceRequest[] = [];
	const calendar = createCalendar(host, {
		events: ({ end, start }) => {
			requests.push({ end, start });
			return [];
		},
		initialDate: "2026-08-06"
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	await delay(80);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(requests.length, 1);
	await waitFor(() => calendar.getState().displayedMonth.month === 9, "pager idle fallback");
	await waitForReady(calendar);
	assert.equal(requests.length, 2);
	assert.equal(rangeLength(requests[1]), 42);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
});

void test("intermediate and elastic out-of-range positions always return to the current snap", async (context) => {
	const { dom, host } = setupDom(context);
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			return [];
		},
		initialDate: "2026-08-06"
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	for (const offset of [
		geometry.nextOffset - 12,
		geometry.nextOffset + 30,
		geometry.previousOffset - 30
	]) {
		setPagerScroll(dom, pager.viewport, offset, true);
		assert.equal(calendar.getState().displayedMonth.month, 8);
		assert.equal(requests, 1);
		assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
		assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
	}
});

void test("pager maps RTL lanes, excludes bounded lanes, and disables paging without swipe", async (context) => {
	const { dom } = setupDom(
		context,
		'<div id="calendar"></div><div id="bounded"></div><div id="disabled"></div>'
	);
	const rtlHost = requireHost(dom, "#calendar");
	rtlHost.dir = "rtl";
	const rtlCalendar = createCalendar(rtlHost, { events: [], initialDate: "2026-08-06" });
	rtlCalendar.render();
	await waitForReady(rtlCalendar);
	const rtlPager = getPager(rtlHost);
	const rtlGeometry = installPagerGeometry(
		rtlPager.viewport, rtlPager.previousLane, rtlPager.grid, rtlPager.nextLane, true
	);
	rtlPager.viewport.scrollLeft = rtlGeometry.centerOffset;
	setPagerScroll(dom, rtlPager.viewport, rtlGeometry.nextOffset, true);
	assert.equal(rtlCalendar.getState().displayedMonth.month, 9);
	setPagerScroll(dom, rtlPager.viewport, rtlGeometry.previousOffset, true);
	assert.equal(rtlCalendar.getState().displayedMonth.month, 8);

	const boundedHost = requireHost(dom, "#bounded");
	let boundedRequests = 0;
	const boundedCalendar = createCalendar(boundedHost, {
		events: () => {
			boundedRequests += 1;
			return [];
		},
		initialDate: "2026-08-06",
		locale: "en-US",
		maxDate: "2026-09-30",
		minDate: "2026-08-01"
	});
	boundedCalendar.render();
	await waitForReady(boundedCalendar);
	const boundedPager = getPager(boundedHost);
	const boundedGeometry = installPagerGeometry(
		boundedPager.viewport, boundedPager.previousLane, boundedPager.grid, boundedPager.nextLane
	);
	boundedPager.viewport.scrollLeft = boundedGeometry.centerOffset;
	const boundedPreviousLabels = requireLaneLabels(boundedPager.previousLane);
	const boundedNextLabels = requireLaneLabels(boundedPager.nextLane);
	assert.equal(boundedPager.previousLane.getAttribute("aria-hidden"), "true");
	assert.equal(boundedPager.nextLane.getAttribute("aria-hidden"), "true");
	assert.equal(boundedPager.previousLane.hasAttribute("data-lfc-page-available"), false);
	assert.equal(boundedPager.nextLane.hasAttribute("data-lfc-page-available"), true);
	assert.equal(boundedPreviousLabels.full.textContent, "");
	assert.equal(boundedPreviousLabels.compact.textContent, "");
	assert.equal(boundedNextLabels.full.textContent, "September 2026");
	assert.equal(boundedNextLabels.compact.textContent, "Sep 2026");
	assert.equal(boundedRequests, 1, "Populating bounded lane labels must not prefetch data.");
	setPagerScroll(dom, boundedPager.viewport, boundedGeometry.previousOffset, true);
	assert.equal(boundedCalendar.getState().displayedMonth.month, 8);
	assert.equal(boundedRequests, 1);
	assert.equal(boundedPager.viewport.scrollLeft, boundedGeometry.centerOffset);
	setPagerScroll(dom, boundedPager.viewport, boundedGeometry.nextOffset, true);
	await waitForReady(boundedCalendar);
	assert.equal(boundedCalendar.getState().displayedMonth.month, 9);
	assert.equal(boundedRequests, 2);
	assert.equal(boundedPager.previousLane.getAttribute("aria-hidden"), "true");
	assert.equal(boundedPager.nextLane.getAttribute("aria-hidden"), "true");
	assert.equal(boundedPager.previousLane.hasAttribute("data-lfc-page-available"), true);
	assert.equal(boundedPager.nextLane.hasAttribute("data-lfc-page-available"), false);
	assert.equal(boundedPreviousLabels.full.textContent, "August 2026");
	assert.equal(boundedPreviousLabels.compact.textContent, "Aug 2026");
	assert.equal(boundedNextLabels.full.textContent, "");
	assert.equal(boundedNextLabels.compact.textContent, "");
	assert.equal(boundedRequests, 2, "Updating bounded lane labels must not prefetch data.");

	const disabledHost = requireHost(dom, "#disabled");
	let disabledResizeObservations = 0;
	class DisabledResizeObserver {
		public disconnect(): void { return; }
		public observe(): void { disabledResizeObservations += 1; }
		public unobserve(): void { return; }
	}
	Object.defineProperty(dom.window, "ResizeObserver", {
		configurable: true,
		value: DisabledResizeObserver
	});
	let disabledRequests = 0;
	const disabledCalendar = createCalendar(disabledHost, {
		events: () => {
			disabledRequests += 1;
			return [];
		},
		initialDate: "2026-08-06",
		swipe: false
	});
	disabledCalendar.render();
	await waitForReady(disabledCalendar);
	const disabledPager = getPager(disabledHost);
	const disabledGeometry = installPagerGeometry(
		disabledPager.viewport,
		disabledPager.previousLane,
		disabledPager.grid,
		disabledPager.nextLane
	);
	assert.equal(disabledHost.hasAttribute("data-lfc-swipe-enabled"), false);
	assert.equal(disabledPager.previousLane.hasAttribute("data-lfc-page-available"), false);
	assert.equal(disabledPager.nextLane.hasAttribute("data-lfc-page-available"), false);
	setPagerScroll(dom, disabledPager.viewport, disabledGeometry.nextOffset, true);
	assert.equal(disabledCalendar.getState().displayedMonth.month, 8);
	assert.equal(disabledRequests, 1);
	assert.equal(
		disabledPager.viewport.scrollLeft,
		disabledGeometry.nextOffset,
		"Disabled swipe must not install a scroll handler that resets programmatic scrolling."
	);
	assert.equal(disabledResizeObservations, 0);
});

void test("touch contacts guard clicks and multi-touch or touchcancel returns to the current month", async (context) => {
	const { dom, host } = setupDom(context);
	const toolbarAction = dom.window.document.createElement("button");
	let actionActivations = 0;
	let selections = 0;
	toolbarAction.addEventListener("click", () => { actionActivations += 1; });
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-08-06",
		onDaySelect: () => { selections += 1; },
		toolbarEnd: toolbarAction
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	dispatchPointer(dom, pager.viewport, "pointerdown", 7, 100, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchstart", 1);
	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	dispatchClick(dom, toolbarAction);
	assert.equal(actionActivations, 1, "Keyboard/programmatic activation must not be swallowed.");
	const day = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-08-10']");
	assert.ok(day);
	dispatchClick(dom, day, 1);
	assert.equal(selections, 0, "The touch-generated click from a horizontal pan must be suppressed.");

	dispatchPointer(dom, pager.viewport, "pointerdown", 8, 100, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchstart", 2);
	dispatchPointer(dom, pager.viewport, "pointerup", 7, 100, 100);
	dispatchPointer(dom, pager.viewport, "pointerup", 8, 100, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchend", 0);
	dispatchScrollEnd(dom, pager.viewport);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);

	dispatchPointer(dom, pager.viewport, "pointerdown", 9, 100, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchstart", 1);
	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	dispatchTouchContacts(dom, pager.viewport, "touchcancel", 0);
	dispatchPointer(dom, pager.viewport, "pointercancel", 9, 100, 100);
	dispatchScrollEnd(dom, pager.viewport);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
});

void test("a fresh toolbar touch clears stale suppression while refetch retains the active pan guard", async (context) => {
	const { dom, host } = setupDom(context);
	const toolbarAction = dom.window.document.createElement("button");
	let actionActivations = 0;
	let selections = 0;
	toolbarAction.addEventListener("click", () => { actionActivations += 1; });
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-08-06",
		onDaySelect: () => { selections += 1; },
		toolbarEnd: toolbarAction
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	dispatchPointer(dom, pager.viewport, "pointerdown", 10, 100, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchstart", 1);
	setPagerScroll(dom, pager.viewport, geometry.centerOffset + 20);
	dispatchPointer(dom, pager.viewport, "pointerup", 10, 80, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchend", 0);
	dispatchScrollEnd(dom, pager.viewport);
	dispatchPointer(dom, toolbarAction, "pointerdown", 11, 100, 100);
	dispatchPointer(dom, toolbarAction, "pointerup", 11, 100, 100);
	dispatchClick(dom, toolbarAction, 1);
	assert.equal(actionActivations, 1, "A fresh toolbar contact must clear the old click guard.");

	dispatchPointer(dom, pager.viewport, "pointerdown", 12, 100, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchstart", 1);
	setPagerScroll(dom, pager.viewport, geometry.centerOffset + 20);
	calendar.refetchEvents();
	await waitForReady(calendar);
	const rerenderedDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-08-10']");
	assert.ok(rerenderedDay);
	dispatchPointer(dom, pager.viewport, "pointerup", 12, 80, 100);
	dispatchTouchContacts(dom, pager.viewport, "touchend", 0);
	dispatchClick(dom, rerenderedDay, 1);
	assert.equal(selections, 0, "Refetch must retain suppression for the displaced held contact.");
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
});

void test("refetch, event replacement, navigation, resize, reentrancy, and destroy cancel pending paging", async (context) => {
	const { dom, host } = setupDom(context);
	let resizeCallback: ResizeObserverCallback | null = null;
	let resizeDisconnects = 0;
	let resizeObservations = 0;
	class TestResizeObserver {
		public constructor(callback: ResizeObserverCallback) {
			resizeCallback = callback;
		}
		public disconnect(): void { resizeDisconnects += 1; }
		public observe(): void { resizeObservations += 1; }
		public unobserve(): void { resizeObservations -= 1; }
	}
	Object.defineProperty(dom.window, "ResizeObserver", {
		configurable: true,
		value: TestResizeObserver
	});
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			return [];
		},
		initialDate: "2026-08-06"
	});
	calendar.render();
	await waitForReady(calendar);
	assert.equal(resizeObservations, 1);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	calendar.refetchEvents();
	await waitForReady(calendar);
	assert.equal(requests, 2);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	await delay(150);
	assert.equal(requests, 2, "Refetch must cancel the pending 120ms pager fallback.");

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	calendar.setEvents(() => {
		requests += 1;
		return [];
	});
	await waitForReady(calendar);
	assert.equal(requests, 3);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	await delay(150);
	assert.equal(requests, 3, "setEvents() must cancel the pending pager fallback.");

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	const triggerResize = resizeCallback as ResizeObserverCallback | null;
	assert.ok(triggerResize);
	triggerResize([], {} as ResizeObserver);
	assert.equal(pager.viewport.scrollLeft, geometry.nextOffset);
	assert.equal(host.getAttribute("data-lfc-swipe-state"), "scrolling");
	triggerResize([resizeEntry(pager.grid)], {} as ResizeObserver);
	assert.equal(pager.viewport.scrollLeft, geometry.nextOffset);
	assert.equal(host.getAttribute("data-lfc-swipe-state"), "scrolling");
	triggerResize([resizeEntry(pager.viewport)], {} as ResizeObserver);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
	await delay(150);
	assert.equal(requests, 3);

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	calendar.next();
	await waitForReady(calendar);
	assert.equal(calendar.getState().displayedMonth.month, 9);
	assert.equal(requests, 4);
	await delay(150);
	assert.equal(calendar.getState().displayedMonth.month, 9);
	assert.equal(requests, 4, "Programmatic navigation must cancel pending pager resolution.");

	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	calendar.destroy();
	await delay(150);
	triggerResize([resizeEntry(pager.viewport)], {} as ResizeObserver);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(resizeDisconnects, 1);
	assert.equal(host.childElementCount, 0);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
});

void test("reentrant provider destruction leaves no stale pager callback or host mutation", async (context) => {
	const { dom, host } = setupDom(context);
	let destroyDuringRequest = false;
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			if (destroyDuringRequest) {
				calendar.destroy();
			}
			return [];
		},
		initialDate: "2026-08-06"
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;
	destroyDuringRequest = true;
	setPagerScroll(dom, pager.viewport, geometry.nextOffset, true);
	await delay(150);

	assert.equal(requests, 2);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
});

void test("fatal rerender cancels pager resolution and recenters the retained viewport", async (context) => {
	const { dom, host } = setupDom(context);
	let failClock = false;
	let fatalErrors = 0;
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-08-06",
		now: () => {
			if (failClock) {
				throw new Error("clock failed during paging");
			}
			return new Date("2026-08-07T02:00:00.000Z");
		},
		onError: (error) => {
			if (error.severity === "fatal") {
				fatalErrors += 1;
			}
			return "handled";
		}
	});
	calendar.render();
	await waitForReady(calendar);
	const pager = getPager(host);
	const geometry = installPagerGeometry(
		pager.viewport, pager.previousLane, pager.grid, pager.nextLane
	);
	pager.viewport.scrollLeft = geometry.centerOffset;
	setPagerScroll(dom, pager.viewport, geometry.nextOffset);
	assert.equal(host.getAttribute("data-lfc-swipe-state"), "scrolling");

	failClock = true;
	calendar.focusDate("2026-08-07");
	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(fatalErrors, 1);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
	assert.equal(pager.viewport.scrollLeft, geometry.centerOffset);
	await delay(150);
	assert.equal(calendar.getState().displayedMonth.month, 8);
	assert.equal(host.matches("[style]") || host.querySelector("[style]") !== null, false);
});

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

function dispatchScrollEnd(dom: ReturnType<typeof createDom>, viewport: HTMLElement): void {
	viewport.dispatchEvent(new dom.window.Event("scrollend"));
}

function dispatchTouchContacts(
	dom: ReturnType<typeof createDom>,
	viewport: HTMLElement,
	type: "touchcancel" | "touchend" | "touchstart",
	contactCount: number
): void {
	const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "touches", { value: Array.from({ length: contactCount }) });
	viewport.dispatchEvent(event);
}

function getPager(host: HTMLElement): PagerDom {
	const viewport = host.querySelector<HTMLElement>(".lfc-calendar-swipe-viewport");
	const previousLane = host.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-previous");
	const grid = host.querySelector<HTMLElement>(".lfc-calendar-grid");
	const nextLane = host.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-next");
	assert.ok(viewport);
	assert.ok(previousLane);
	assert.ok(grid);
	assert.ok(nextLane);
	return { grid, nextLane, previousLane, viewport };
}

function rangeLength(request: SourceRequest | undefined): number {
	assert.ok(request);
	return (Date.parse(`${request.end}T00:00:00.000Z`) -
		Date.parse(`${request.start}T00:00:00.000Z`)) / 86_400_000;
}

function resizeEntry(target: Element): ResizeObserverEntry {
	return { target } as unknown as ResizeObserverEntry;
}

function requireHost(dom: ReturnType<typeof createDom>, selector: string): HTMLElement {
	const host = dom.window.document.querySelector<HTMLElement>(selector);
	assert.ok(host);
	return host;
}

function requireLaneLabels(lane: HTMLElement): Readonly<{
	compact: HTMLElement;
	full: HTMLElement;
	wrapper: HTMLElement;
}> {
	const wrapper = lane.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-label");
	const full = wrapper?.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-label-full");
	const compact = wrapper?.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-label-compact");
	assert.ok(wrapper);
	assert.ok(full);
	assert.ok(compact);
	assert.deepEqual([...wrapper.children], [full, compact]);
	return { compact, full, wrapper };
}

function setPagerScroll(
	dom: ReturnType<typeof createDom>,
	viewport: HTMLElement,
	offset: number,
	end = false
): void {
	syntheticWheelTime += 121;
	const wheel = new dom.window.WheelEvent("wheel", {
		bubbles: true,
		deltaX: 40,
		deltaY: 0
	});
	Object.defineProperty(wheel, "timeStamp", { value: syntheticWheelTime });
	viewport.dispatchEvent(wheel);
	viewport.scrollLeft = offset;
	viewport.dispatchEvent(new dom.window.Event("scroll"));
	if (end) {
		dispatchScrollEnd(dom, viewport);
	}
}

function setupDom(context: TestContext, markup?: string): {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
} {
	const dom = createDom(markup);
	const cleanup = installDom(dom);
	context.after(cleanup);
	return { dom, host: requireHost(dom, "#calendar") };
}

async function waitForReady(calendar: Calendar): Promise<void> {
	await waitFor(() => calendar.getState().phase === "ready", "calendar ready phase");
}
