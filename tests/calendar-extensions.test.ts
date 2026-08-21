import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarExtension,
	type LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	installDom,
	waitFor
} from "./helpers/dom.js";

void test("extensions are ordered, isolated, and completely cleaned up", async (context) => {
	const { dom, host } = setupDom(context);
	const hookOrder: string[] = [];
	const lifecycleSignals: AbortSignal[] = [];
	let cleanups = 0;
	const errors: LitefoldCalendarError[] = [];
	const extensions: readonly CalendarExtension[] = [
		{
			eventDidMount: ({ signal }) => {
				lifecycleSignals.push(signal);
				return () => {
					cleanups += 1;
				};
			},
			id: "first",
			renderEventLeading: () => {
				hookOrder.push("first");
				const node = dom.window.document.createElement("span");
				node.textContent = "FIRST";
				return node;
			}
		},
		{
			id: "private-extension-identifier",
			renderEventDetails: () => {
				hookOrder.push("failing");
				throw new Error("private extension details");
			}
		},
		{
			id: "later",
			renderEventTrailing: () => {
				hookOrder.push("later");
				const node = dom.window.document.createElement("span");
				node.textContent = "LATER";
				return node;
			}
		}
	];
	const calendar = createCalendar(host, {
		events: async () => [event("extension-event", "2026-07-14", "Extended")],
		extensions,
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.deepEqual(hookOrder.slice(0, 3), ["first", "failing", "later"]);
	assert.match(host.textContent ?? "", /FIRST/);
	assert.match(host.textContent ?? "", /LATER/);
	assert.doesNotMatch(host.textContent ?? "", /private-extension-identifier|private extension details/);
	assert.equal(errors.filter((error) => error.code === "extension-failed").length, 1);
	const failingCalls = hookOrder.filter((name) => name === "failing").length;
	calendar.focusDate("2026-07-14");
	assert.equal(hookOrder.filter((name) => name === "failing").length, failingCalls, "A quarantined extension must not run again.");

	calendar.destroy();
	assert.ok(lifecycleSignals.length > 0);
	assert.ok(lifecycleSignals.every((signal) => signal.aborted));
	assert.ok(cleanups > 0);
	assert.equal(host.childElementCount, 0);
});

void test("day badges render into the visual-only badge slot", async (context) => {
	const { host } = setupDom(context);
	let badgeElement: HTMLElement | undefined;
	let badgeNode: Node | undefined;
	const calendar = createCalendar(host, {
		events: async () => [],
		extensions: [{
			dayDidMount: ({ dateString, elements }) => {
				if (dateString === "2026-07-14") {
					badgeElement = elements.badge;
				}
			},
			id: "day-badge",
			renderDayBadge: ({ dateString, document: ownerDocument }) => {
				if (dateString !== "2026-07-14") {
					return null;
				}
				const node = ownerDocument.createElement("span");
				node.textContent = "Milestone";
				badgeNode = node;
				return node;
			}
		}],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.ok(badgeElement);
	assert.equal(badgeElement.getAttribute("aria-hidden"), "true");
	assert.equal(badgeNode?.parentNode, badgeElement);
	assert.equal(badgeElement.textContent, "Milestone");
});

void test("a failing day badge is quarantined with the public hook name", async (context) => {
	const { host } = setupDom(context);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: async () => [],
		extensions: [{
			id: "failing-day-badge",
			renderDayBadge: () => {
				throw new Error("private badge failure");
			}
		}],
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.equal(captured?.code, "extension-failed");
	assert.equal(captured?.hook, "renderDayBadge");
	assert.equal(captured?.surface, "day");
	assert.equal(getGrid(host).querySelectorAll("[role='gridcell']").length, 42);
	assert.doesNotMatch(host.textContent ?? "", /private badge failure|failing-day-badge/u);
});

void test("renderEventMarker replaces or suppresses the built-in marker", async (context) => {
	const { host } = setupDom(context);
	const surfaces: string[] = [];
	const replacementCalendar = createCalendar(host, {
		events: [event("marker-event", "2026-07-14T09:00", "Marker event")],
		extensions: [{
			id: "replacement-marker",
			renderEventMarker: ({ document: ownerDocument, surface }) => {
				surfaces.push(surface);
				const marker = ownerDocument.createElement("span");
				marker.className = "example-event-marker";
				marker.textContent = "M";
				return marker;
			}
		}],
		initialDate: "2026-07-14"
	});
	replacementCalendar.render();
	await waitForPhase(replacementCalendar, "ready");

	assert.equal(host.querySelectorAll(".example-event-marker").length, 2);
	assert.equal(host.querySelector(".lfc-calendar-event-accent"), null);
	assert.deepEqual(surfaces.sort(), ["agenda", "grid-summary"]);
	replacementCalendar.destroy();

	const suppressionCalendar = createCalendar(host, {
		events: [event("suppressed-marker", "2026-07-14T09:00", "Suppressed marker")],
		extensions: [{
			id: "suppressed-marker",
			renderEventMarker: () => null
		}],
		initialDate: "2026-07-14"
	});
	suppressionCalendar.render();
	await waitForPhase(suppressionCalendar, "ready");

	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.equal(markerSlots.length, 2);
	assert.ok(markerSlots.every((marker) => marker.childNodes.length === 0));
	assert.equal(host.querySelector(".lfc-calendar-event-accent"), null);
});

void test("a quarantined marker renderer restores every built-in marker fallback", async (context) => {
	const { host } = setupDom(context);
	let calls = 0;
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [event("marker-fallback", "2026-07-14T09:00", "Marker fallback")],
		extensions: [{
			id: "failing-marker",
			renderEventMarker: ({ document: ownerDocument }) => {
				calls += 1;
				if (calls === 2) {
					throw new Error("private marker failure");
				}
				return ownerDocument.createElement("span");
			}
		}],
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitForPhase(calendar, "degraded");

	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.equal(calls, 2);
	assert.equal(captured?.hook, "renderEventMarker");
	assert.equal(markerSlots.length, 2);
	assert.ok(markerSlots.every((marker) => marker.querySelector(".lfc-calendar-event-accent") !== null));
	assert.doesNotMatch(host.textContent ?? "", /private marker failure|failing-marker/u);
});

void test("renderEventLeading contains text nodes in a compact-hideable wrapper", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [event("text-leading", "2026-07-14T09:00", "Text leading")],
		extensions: [{
			id: "text-leading",
			renderEventLeading: ({ document: ownerDocument }) => ownerDocument.createTextNode("Priority")
		}],
		initialDate: "2026-07-14"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	const leadingSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-leading")];
	assert.equal(leadingSlots.length, 2);
	for (const leading of leadingSlots) {
		const marker = leading.querySelector(":scope > .lfc-calendar-event-marker");
		const content = leading.querySelector(":scope > .lfc-calendar-event-leading-content");
		assert.ok(marker);
		assert.ok(content);
		assert.equal(content.textContent, "Priority");
		assert.equal(content.firstChild?.nodeType, dom.window.Node.TEXT_NODE);
		assert.equal([...leading.childNodes].some((node) => node.nodeType === dom.window.Node.TEXT_NODE), false);
	}
});

void test("cross-document extension nodes are rejected without taking down core UI", async (context) => {
	const { host } = setupDom(context);
	const foreignDom = createDom('<div id="foreign"></div>');
	context.after(() => {
		foreignDom.window.close();
	});
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: async () => [event("safe", "2026-07-14", "Core event")],
		extensions: [{
			id: "foreign-node",
			renderEventDetails: () => foreignDom.window.document.createElement("span")
		}],
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitFor(() => captured?.code === "extension-failed", "cross-document extension error");
	assert.ok(captured);
	assert.match(getAgenda(host).textContent ?? "", /Core event/);
	assert.equal(calendar.getState().phase, "degraded");
});

void test("extension cleanup failures quarantine the extension while preserving calendar data", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: async () => [event("cleanup", "2026-07-14", "Preserved event")],
		extensions: [{
			eventDidMount: () => () => {
				throw new Error("private cleanup failure");
			},
			id: "cleanup-failure"
		}],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	calendar.focusDate("2026-07-14");
	await waitFor(() => errors.some((error) => error.hook === "cleanup"), "extension cleanup failure");

	assert.match(getAgenda(host).textContent ?? "", /Preserved event/);
	assert.doesNotMatch(host.textContent ?? "", /private cleanup failure|cleanup-failure/);
	assert.equal(calendar.getState().phase, "degraded");
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(context: TestContext): TestDom {
	const dom = createDom('<div id="calendar"></div>');
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host, "Expected #calendar to exist.");
	return { dom, host };
}

function event(id: string, start: string, title: string): CalendarEventInput {
	return { id, start, title };
}

function getGrid(host: HTMLElement): HTMLElement {
	const grid = host.querySelector<HTMLElement>("[role='grid']");
	assert.ok(grid, "Expected the month grid to exist.");
	return grid;
}

function getAgenda(host: HTMLElement): HTMLElement {
	const agenda = host.querySelector<HTMLElement>("section[aria-labelledby]");
	assert.ok(agenda, "Expected the selected-day agenda to exist.");
	return agenda;
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
