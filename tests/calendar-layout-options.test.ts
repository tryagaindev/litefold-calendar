import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	LitefoldCalendarError,
	type Calendar
} from "../src/index.js";
import { createDom, getHost, installDom, waitFor } from "./helpers/dom.js";

void test("grid layout options use stable defaults and preserve their explicit modes", async (context) => {
	const host = setupDom(context);
	const cases = [
		{
			expectedPlacement: "top",
			expectedSizing: "equal",
			name: "defaults",
			options: {}
		},
		{
			expectedPlacement: "top",
			expectedSizing: "equal",
			name: "explicit defaults",
			options: { gridEventPlacement: "top", weekRowSizing: "equal" }
		},
		{
			expectedPlacement: "center",
			expectedSizing: "content",
			name: "centered content rows",
			options: { gridEventPlacement: "center", weekRowSizing: "content" }
		},
		{
			expectedPlacement: "bottom",
			expectedSizing: "equal",
			name: "bottom-aligned equal rows",
			options: { gridEventPlacement: "bottom", weekRowSizing: "equal" }
		}
	] as const;

	for (const testCase of cases) {
		const calendar = createCalendar(host, {
			events: [],
			initialDate: "2026-07-14",
			...testCase.options
		});
		calendar.render();
		await waitForPhase(calendar, "ready");

		const weeks = host.querySelector<HTMLElement>(".lfc-calendar-weeks");
		assert.ok(weeks, `${testCase.name}: expected the month week structure.`);
		assert.equal(
			weeks.getAttribute("data-lfc-grid-event-placement"),
			testCase.expectedPlacement,
			`${testCase.name}: event placement.`
		);
		assert.equal(
			weeks.getAttribute("data-lfc-week-row-sizing"),
			testCase.expectedSizing,
			`${testCase.name}: week-row sizing.`
		);
		assert.equal(host.hasAttribute("data-lfc-grid-event-placement"), false);
		assert.equal(host.hasAttribute("data-lfc-week-row-sizing"), false);

		calendar.destroy();
		assert.equal(host.contains(weeks), false, `${testCase.name}: destroy removes the structure.`);
		assert.equal(host.childElementCount, 0);
	}
});

void test("grid layout options are snapshotted once during construction", async (context) => {
	const host = setupDom(context);
	let placement: "bottom" | "top" = "bottom";
	let placementReads = 0;
	let sizing: "content" | "equal" = "content";
	let sizingReads = 0;
	const options = {
		events: [],
		initialDate: "2026-07-14"
	};
	Object.defineProperties(options, {
		gridEventPlacement: {
			get: () => {
				placementReads += 1;
				return placement;
			}
		},
		weekRowSizing: {
			get: () => {
				sizingReads += 1;
				return sizing;
			}
		}
	});
	const calendar = createCalendar(host, options);
	placement = "top";
	sizing = "equal";

	calendar.render();
	await waitForPhase(calendar, "ready");

	const weeks = host.querySelector<HTMLElement>(".lfc-calendar-weeks");
	assert.ok(weeks);
	assert.equal(placementReads, 1);
	assert.equal(sizingReads, 1);
	assert.equal(weeks.getAttribute("data-lfc-grid-event-placement"), "bottom");
	assert.equal(weeks.getAttribute("data-lfc-week-row-sizing"), "content");
});

void test("grid layout options reject unsupported values before committing generated DOM", (context) => {
	const host = setupDom(context);
	const invalidOptions = [
		{ events: [], gridEventPlacement: "start" },
		{ events: [], gridEventPlacement: null },
		{ events: [], weekRowSizing: "fixed" },
		{ events: [], weekRowSizing: null }
	];

	for (const options of invalidOptions) {
		assert.throws(
			() => createCalendar(host, options as never),
			(error: unknown) => error instanceof LitefoldCalendarError &&
				error.code === "invalid-configuration"
		);
		assert.equal(host.childElementCount, 0);
		assert.equal(host.classList.contains("litefold-calendar"), false);
		assert.equal(host.hasAttribute("data-litefold-calendar"), false);
	}
});

function setupDom(context: TestContext): HTMLElement {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	return getHost(dom);
}

async function waitForPhase<TMetadata>(
	calendar: Calendar<TMetadata>,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
