import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createCalendar, type Calendar } from "../src/index.js";
import { createDom, dispatchClick, installDom, waitFor } from "./helpers/dom.js";

const SELECTION_ANIMATION_NAME = "lfc-day-selection-reveal";
const SELECTION_CONFIRM_ANIMATION_NAME = "lfc-day-selection-confirm";

void test("day activation marks only the committed selection render for visual feedback", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		now: () => new Date("2026-07-19T12:00:00Z")
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
	calendar.focusDate("2026-07-15");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
	const todayControl = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(todayControl);
	dispatchClick(dom, todayControl);
	assert.equal(findDayButton(host, "2026-07-19").parentElement?.getAttribute("aria-selected"), "true");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
	calendar.focusToday();
	assert.equal(findDayButton(host, "2026-07-19").parentElement?.getAttribute("aria-selected"), "true");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);

	dispatchClick(dom, findDayButton(host, "2026-07-16"));
	const activatedCell = findDayButton(host, "2026-07-16").parentElement;
	assert.ok(activatedCell);
	assert.equal(activatedCell.getAttribute("aria-selected"), "true");
	assert.equal(activatedCell.classList.contains("lfc-is-selection-entry"), true);

	const activatedButton = findDayButton(host, "2026-07-16");
	const activatedNumber = activatedButton.querySelector(".lfc-calendar-day-number");
	assert.ok(activatedNumber);
	dispatchAnimationEvent(dom, activatedNumber, "animationend", SELECTION_CONFIRM_ANIMATION_NAME);
	assert.equal(activatedCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, activatedNumber, "animationend", SELECTION_ANIMATION_NAME);
	assert.equal(activatedCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, activatedButton, "animationend", SELECTION_ANIMATION_NAME, "::after");
	assert.equal(activatedCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, activatedButton, "animationend", "unrelated-animation");
	assert.equal(activatedCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, activatedButton, "animationend", SELECTION_ANIMATION_NAME);
	assert.equal(activatedCell.classList.contains("lfc-is-selection-entry"), false);
	dispatchClick(dom, findDayButton(host, "2026-07-16"));
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
	dispatchClick(dom, findDayButton(host, "2026-07-19"));
	const currentDayButton = findDayButton(host, "2026-07-19");
	const currentDayCell = currentDayButton.parentElement;
	assert.ok(currentDayCell);
	assert.equal(currentDayCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, currentDayButton, "animationend", SELECTION_ANIMATION_NAME);
	assert.equal(currentDayCell.classList.contains("lfc-is-selection-entry"), false);

	dispatchClick(dom, findDayButton(host, "2026-07-17"));
	const replacedButton = findDayButton(host, "2026-07-17");
	const replacedCell = replacedButton.parentElement;
	assert.ok(replacedCell);
	assert.equal(replacedCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, replacedButton, "animationcancel", SELECTION_ANIMATION_NAME);
	assert.equal(replacedCell.classList.contains("lfc-is-selection-entry"), false);

	dispatchClick(dom, findDayButton(host, "2026-07-18"));
	assert.ok(host.querySelector(".lfc-is-selection-entry"));
	calendar.refetchEvents();
	await waitForPhase(calendar, "ready");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
	dispatchClick(dom, findDayButton(host, "2026-07-17"));
	assert.ok(host.querySelector(".lfc-is-selection-entry"));
	calendar.setEvents([{ id: "replacement", start: "2026-07-17", title: "Replacement" }]);
	await waitForPhase(calendar, "ready");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);

	dispatchClick(dom, findDayButton(host, "2026-08-01"));
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
	await waitForPhase(calendar, "ready");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
});

void test("rapid reselection leaves feedback only on the latest committed date", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	dispatchClick(dom, findDayButton(host, "2026-07-15"));
	const staleButton = findDayButton(host, "2026-07-15");
	assert.equal(host.querySelectorAll(".lfc-is-selection-entry").length, 1);

	dispatchClick(dom, findDayButton(host, "2026-07-16"));
	const currentButton = findDayButton(host, "2026-07-16");
	const currentCell = currentButton.parentElement;
	assert.ok(currentCell);
	assert.equal(host.querySelectorAll(".lfc-is-selection-entry").length, 1);
	assert.equal(currentCell.classList.contains("lfc-is-selection-entry"), true);

	dispatchAnimationEvent(dom, staleButton, "animationcancel", SELECTION_ANIMATION_NAME);
	assert.equal(currentCell.classList.contains("lfc-is-selection-entry"), true);
	dispatchAnimationEvent(dom, currentButton, "animationend", SELECTION_ANIMATION_NAME);
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
});

void test("reduced motion renders a direct selection without transient feedback", async (context) => {
	const { dom, host } = setupDom(context);
	Object.defineProperty(dom.window, "matchMedia", {
		configurable: true,
		value: (query: string) => ({
			matches: query !== "(prefers-reduced-motion: no-preference)",
			media: query
		})
	});
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	dispatchClick(dom, findDayButton(host, "2026-07-15"));
	const selectedCell = findDayButton(host, "2026-07-15").parentElement;
	assert.ok(selectedCell);
	assert.equal(selectedCell.getAttribute("aria-selected"), "true");
	assert.equal(host.querySelector(".lfc-is-selection-entry"), null);
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(context: TestContext): TestDom {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

function findDayButton(host: HTMLElement, date: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(`button[data-lfc-date='${date}']`);
	assert.ok(button);
	return button;
}

function dispatchAnimationEvent(
	dom: ReturnType<typeof createDom>,
	element: Element,
	type: "animationcancel" | "animationend",
	animationName: string,
	pseudoElement = ""
): void {
	const event = new dom.window.Event(type, { bubbles: true });
	Object.defineProperties(event, {
		animationName: { value: animationName },
		pseudoElement: { value: pseudoElement }
	});
	element.dispatchEvent(event);
}

async function waitForPhase(calendar: Calendar, phase: ReturnType<Calendar["getState"]>["phase"]): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
