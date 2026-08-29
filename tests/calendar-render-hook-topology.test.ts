import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarRenderHooks,
	type LitefoldCalendarError
} from "../src/index.js";
import { createDom, installDom, waitFor } from "./helpers/dom.js";

void test("detached hosts accept self-contained custom render output", async (context) => {
	const { dom } = setupDom(context);
	const host = dom.window.document.createElement("div");
	class SelfContainedMarkerElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			const content = dom.window.document.createElement("span");
			content.textContent = "Connected marker";
			this.append(content);
		}
	}
	dom.window.customElements.define("lfc-detached-host-marker", SelfContainedMarkerElement);
	const calendar = createCalendar(host, {
		events: [event("detached", "2026-07-14T09:00", "Detached event")],
		initialDate: "2026-07-14",
		renderHooks: [{
			id: "detached-host-marker",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-detached-host-marker")
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	assert.equal(host.querySelector("lfc-detached-host-marker")?.textContent, "");

	dom.window.document.body.append(host);
	assert.equal(host.querySelector("lfc-detached-host-marker")?.textContent, "Connected marker");
	assert.equal(calendar.getState().phase, "ready");
});

void test("open-shadow interactive render output is quarantined", async (context) => {
	const { dom, host } = setupDom(context);
	class ShadowButtonMarkerElement extends dom.window.HTMLElement {
		public constructor() {
			super();
			this.attachShadow({ mode: "open" }).append(dom.window.document.createElement("button"));
		}
	}
	dom.window.customElements.define("lfc-shadow-button-marker", ShadowButtonMarkerElement);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [event("shadow", "2026-07-14T09:00", "Shadow event")],
		initialDate: "2026-07-14",
		onError: (error) => { captured = error; },
		renderHooks: [{
			id: "shadow-button-marker",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-shadow-button-marker")
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.equal(captured?.hook, "renderEventMarker");
	assert.equal(host.querySelector("lfc-shadow-button-marker"), null);
	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.ok(markerSlots.every((marker) => marker.querySelector(".lfc-calendar-event-accent") !== null));
});

void test("detaching a stable render region makes the calendar unavailable", async (context) => {
	const { dom, host } = setupDom(context);
	class StableRegionRemovingMarkerElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			this.closest(".lfc-calendar-weeks")?.remove();
		}
	}
	dom.window.customElements.define("lfc-stable-region-remover", StableRegionRemovingMarkerElement);
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: [event("fatal", "2026-07-14T09:00", "Fatal event")],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		renderHooks: [{
			id: "stable-region-remover",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-stable-region-remover")
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "unavailable");

	assert.ok(errors.some((error) => error.code === "internal-error" && error.severity === "fatal"));
	assert.equal(calendar.getState().phase, "unavailable");
});

void test("owner corruption quarantines every contributor without quarantining other owners", async (context) => {
	const { dom, host } = setupDom(context);
	class EscapingEventOutputElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			this.parentElement?.parentElement?.append(dom.window.document.createElement("button"));
		}
	}
	dom.window.customElements.define("lfc-ambiguous-event-output", EscapingEventOutputElement);
	const calls = { corrupting: 0, neighboring: 0, survivor: 0 };
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: [
			event("shared-owner", "2026-07-14T09:00", "Shared owner"),
			event("other-owner", "2026-07-15T09:00", "Other owner")
		],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		renderHooks: [
			{
				id: "corrupting-contributor",
				renderEventTrailing: ({ document: ownerDocument, event: renderedEvent, surface }) => {
					if (renderedEvent.id !== "shared-owner" || surface !== "grid-summary") {
						return null;
					}
					calls.corrupting += 1;
					return ownerDocument.createElement("lfc-ambiguous-event-output");
				}
			},
			{
				id: "neighboring-contributor",
				renderEventTrailing: ({ document: ownerDocument, event: renderedEvent, surface }) => {
					if (renderedEvent.id !== "shared-owner" || surface !== "grid-summary") {
						return null;
					}
					calls.neighboring += 1;
					return ownerDocument.createElement("span");
				}
			},
			{
				id: "other-owner-survivor",
				renderEventTrailing: ({ document: ownerDocument, event: renderedEvent, surface }) => {
					if (renderedEvent.id !== "other-owner" || surface !== "grid-summary") {
						return null;
					}
					calls.survivor += 1;
					const output = ownerDocument.createElement("span");
					output.className = "other-owner-output";
					return output;
				}
			}
		]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.deepEqual(calls, { corrupting: 1, neighboring: 1, survivor: 2 });
	assert.deepEqual(errors.map((error) => error.renderHookId).sort(), [
		"corrupting-contributor",
		"neighboring-contributor"
	]);
	assert.equal(host.querySelector("lfc-ambiguous-event-output"), null);
	assert.ok(host.querySelector(".other-owner-output"));
});

void test("recovery performs at most one pass per new quarantine plus a fallback pass", async (context) => {
	const { dom, host } = setupDom(context);
	let delayedConnections = 0;
	class FirstCorruptingOutputElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			this.parentElement?.parentElement?.append(dom.window.document.createElement("button"));
		}
	}
	class DelayedCorruptingOutputElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			delayedConnections += 1;
			if (delayedConnections === 2) {
				this.parentElement?.parentElement?.append(dom.window.document.createElement("button"));
			}
		}
	}
	dom.window.customElements.define("lfc-first-corrupting-output", FirstCorruptingOutputElement);
	dom.window.customElements.define("lfc-delayed-corrupting-output", DelayedCorruptingOutputElement);
	const calls = { first: 0, second: 0, survivor: 0 };
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: [
			event("first", "2026-07-14T09:00", "First"),
			event("second", "2026-07-15T09:00", "Second"),
			event("survivor", "2026-07-16T09:00", "Survivor")
		],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		renderHooks: [
			createGridEventHook("first-corruptor", "first", "lfc-first-corrupting-output", calls, "first"),
			createGridEventHook("second-corruptor", "second", "lfc-delayed-corrupting-output", calls, "second"),
			createGridEventHook("bounded-survivor", "survivor", "span", calls, "survivor")
		]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.deepEqual(calls, { first: 1, second: 2, survivor: 3 });
	assert.deepEqual(errors.map((error) => error.renderHookId), ["first-corruptor", "second-corruptor"]);
	assert.equal(host.querySelectorAll(".lfc-calendar-event-summary button").length, 0);
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

function createGridEventHook(
	id: string,
	eventId: string,
	tagName: string,
	calls: Record<"first" | "second" | "survivor", number>,
	callKey: "first" | "second" | "survivor"
): Readonly<CalendarRenderHooks> {
	return {
		id,
		renderEventTrailing: ({ document: ownerDocument, event: renderedEvent, surface }) => {
			if (renderedEvent.id !== eventId || surface !== "grid-summary") {
				return null;
			}
			calls[callKey] += 1;
			return ownerDocument.createElement(tagName);
		}
	};
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
