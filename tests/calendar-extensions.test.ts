import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarExtension,
	type CalendarGridOverflowContentContext,
	type CalendarMultipleEventIndicatorContext,
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

void test("a marker that reparents itself while connecting cannot suppress built-in fallbacks", async (context) => {
	const { dom, host } = setupDom(context);
	const detachedTarget = dom.window.document.createElement("div");
	class ReparentingMarkerElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			detachedTarget.append(this);
		}
	}
	dom.window.customElements.define("lfc-reparenting-marker", ReparentingMarkerElement);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [event("reparenting-marker", "2026-07-14T09:00", "Reparenting marker")],
		extensions: [{
			id: "reparenting-marker",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-reparenting-marker")
		}],
		initialDate: "2026-07-14",
		onError: (error) => { captured = error; }
	});

	calendar.render();
	await waitFor(() => captured !== undefined);

	assert.equal(captured?.code, "extension-failed");
	assert.equal(captured?.hook, "renderEventMarker");
	assert.ok(detachedTarget.querySelectorAll("lfc-reparenting-marker").length > 0);
	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.equal(markerSlots.length, 2);
	assert.ok(markerSlots.every((marker) => marker.querySelector(".lfc-calendar-event-accent") !== null));
});

void test("connected extension output cannot add interactive descendants", async (context) => {
	const { dom, host } = setupDom(context);
	class InteractiveMarkerElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			this.append(dom.window.document.createElement("button"));
		}
	}
	dom.window.customElements.define("lfc-interactive-marker", InteractiveMarkerElement);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [event("interactive-marker", "2026-07-14T09:00", "Interactive marker")],
		extensions: [{
			id: "interactive-marker",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-interactive-marker")
		}],
		initialDate: "2026-07-14",
		onError: (error) => { captured = error; }
	});

	calendar.render();
	await waitFor(() => captured !== undefined);

	assert.equal(captured?.code, "extension-failed");
	assert.equal(captured?.hook, "renderEventMarker");
	assert.equal(host.querySelector("lfc-interactive-marker"), null);
	assert.equal(host.querySelector(".lfc-calendar-event-marker button"), null);
	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.equal(markerSlots.length, 2);
	assert.ok(markerSlots.every((marker) => marker.querySelector(".lfc-calendar-event-accent") !== null));
});

void test("the built-in multiple-event cue uses the authoritative count independently of the grid cap", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [
			event("single", "2026-07-13T09:00", "Single event"),
			event("multiple-a", "2026-07-14T09:00", "First multiple event"),
			event("multiple-b", "2026-07-14T10:00", "Second multiple event")
		],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 0
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(getMultipleEventIndicator(host, "2026-07-12").childNodes.length, 0);
	assert.equal(getMultipleEventIndicator(host, "2026-07-13").childNodes.length, 0);
	const multipleIndicator = getMultipleEventIndicator(host, "2026-07-14");
	assert.equal(multipleIndicator.getAttribute("aria-hidden"), "true");
	assert.equal(
		multipleIndicator.querySelectorAll(":scope > .lfc-calendar-multiple-event-indicator-icon").length,
		1
	);
	const overflow = getGridOverflowButton(host, "2026-07-14");
	const customContent = overflow.querySelector<HTMLElement>(
		":scope > .lfc-calendar-grid-more-custom-content"
	);
	const defaultContent = overflow.querySelector<HTMLElement>(
		":scope > .lfc-calendar-grid-more-default-content"
	);
	assert.ok(customContent);
	assert.equal(customContent.getAttribute("aria-hidden"), "true");
	assert.equal(customContent.childNodes.length, 0);
	assert.ok(defaultContent);
	assert.ok((defaultContent.textContent ?? "").trim().length > 0);
	assert.ok((overflow.getAttribute("aria-label") ?? "").trim().length > 0);
});

void test("renderMultipleEventIndicator skips out-of-range structural days", async (context) => {
	const { host } = setupDom(context);
	const dates: string[] = [];
	const calendar = createCalendar(host, {
		events: [
			event("outside-a", "2026-07-13T09:00", "Outside A"),
			event("outside-b", "2026-07-13T10:00", "Outside B"),
			event("inside-a", "2026-07-14T09:00", "Inside A"),
			event("inside-b", "2026-07-14T10:00", "Inside B")
		],
		extensions: [{
			id: "range-aware-multiple-event-indicator",
			renderMultipleEventIndicator: ({ dateString }) => {
				dates.push(dateString);
				return undefined;
			}
		}],
		initialDate: "2026-07-14",
		maxDate: "2026-07-14",
		minDate: "2026-07-14"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(dates, ["2026-07-14"]);
	assert.equal(getMultipleEventIndicator(host, "2026-07-13").childNodes.length, 0);
	assert.equal(
		getMultipleEventIndicator(host, "2026-07-14")
			.querySelectorAll(":scope > .lfc-calendar-multiple-event-indicator-icon").length,
		1
	);
});

void test("renderMultipleEventIndicator receives day context and supports custom, null, and undefined results", async (context) => {
	const { dom, host } = setupDom(context);
	const contexts: Readonly<CalendarMultipleEventIndicatorContext>[] = [];
	const calendar = createCalendar(host, {
		events: [
			event("single", "2026-07-13T09:00", "Single event"),
			event("custom-a", "2026-07-14T09:00", "Custom one"),
			event("custom-b", "2026-07-14T10:00", "Custom two"),
			event("suppressed-a", "2026-07-15T09:00", "Suppressed one"),
			event("suppressed-b", "2026-07-15T10:00", "Suppressed two"),
			event("default-a", "2026-07-16T09:00", "Default one"),
			event("default-b", "2026-07-16T10:00", "Default two")
		],
		extensions: [{
			id: "multiple-event-presentations",
			renderMultipleEventIndicator: (extensionContext) => {
				contexts.push(extensionContext);
				if (extensionContext.dateString === "2026-07-14") {
					const replacement = extensionContext.document.createElement("span");
					replacement.className = "example-multiple-event-indicator";
					replacement.textContent = "Multiple";
					return replacement;
				}
				return extensionContext.dateString === "2026-07-15" ? null : undefined;
			}
		}],
		initialDate: "2026-07-14"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(contexts.map((extensionContext) => extensionContext.dateString), [
		"2026-07-14",
		"2026-07-15",
		"2026-07-16"
	]);
	for (const extensionContext of contexts) {
		assert.equal(extensionContext.document, dom.window.document);
		assert.equal(extensionContext.surface, "day");
		assert.equal(extensionContext.eventCount, 2);
		assert.equal(extensionContext.signal.aborted, false);
		assert.equal(Object.isFrozen(extensionContext), true);
		assert.equal(Object.isFrozen(extensionContext.date), true);
		assert.deepEqual(extensionContext.date, {
			day: Number(extensionContext.dateString.slice(-2)),
			month: 7,
			year: 2026
		});
	}
	assert.equal(
		getMultipleEventIndicator(host, "2026-07-14")
			.querySelectorAll(":scope > .example-multiple-event-indicator").length,
		1
	);
	assert.equal(
		getMultipleEventIndicator(host, "2026-07-14")
			.querySelector(".lfc-calendar-multiple-event-indicator-icon"),
		null
	);
	assert.equal(getMultipleEventIndicator(host, "2026-07-15").childNodes.length, 0);
	assert.ok(
		getMultipleEventIndicator(host, "2026-07-16")
			.querySelector(":scope > .lfc-calendar-multiple-event-indicator-icon")
	);

	calendar.destroy();
	assert.ok(contexts.every((extensionContext) => extensionContext.signal.aborted));
});

void test("a quarantined multiple-event renderer restores all built-in cue fallbacks", async (context) => {
	const { host } = setupDom(context);
	let calls = 0;
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [
			event("first-a", "2026-07-14T09:00", "First day one"),
			event("first-b", "2026-07-14T10:00", "First day two"),
			event("second-a", "2026-07-15T09:00", "Second day one"),
			event("second-b", "2026-07-15T10:00", "Second day two")
		],
		extensions: [{
			id: "failing-multiple-event-indicator",
			renderMultipleEventIndicator: ({ document: ownerDocument }) => {
				calls += 1;
				if (calls === 2) {
					throw new Error("private multiple-event indicator failure");
				}
				const replacement = ownerDocument.createElement("span");
				replacement.className = "temporary-multiple-event-indicator";
				return replacement;
			}
		}],
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.equal(calls, 2);
	assert.equal(captured?.hook, "renderMultipleEventIndicator");
	assert.equal(captured?.surface, "day");
	assert.equal(host.querySelector(".temporary-multiple-event-indicator"), null);
	for (const dateString of ["2026-07-14", "2026-07-15"]) {
		const indicator = getMultipleEventIndicator(host, dateString);
		assert.equal(
			indicator.querySelectorAll(":scope > .lfc-calendar-multiple-event-indicator-icon").length,
			1
		);
	}
	assert.doesNotMatch(
		host.textContent ?? "",
		/private multiple-event indicator failure|failing-multiple-event-indicator/u
	);
});

void test("renderGridOverflowContent receives counts while preserving canonical button content", async (context) => {
	const { dom, host } = setupDom(context);
	const contexts: Readonly<CalendarGridOverflowContentContext>[] = [];
	const calendar = createCalendar(host, {
		events: [
			event("custom-a", "2026-07-14T09:00", "Custom one"),
			event("custom-b", "2026-07-14T10:00", "Custom two"),
			event("null-a", "2026-07-15T09:00", "Null one"),
			event("null-b", "2026-07-15T10:00", "Null two"),
			event("undefined-a", "2026-07-16T09:00", "Undefined one"),
			event("undefined-b", "2026-07-16T10:00", "Undefined two")
		],
		extensions: [{
			id: "grid-overflow-presentations",
			renderGridOverflowContent: (extensionContext) => {
				contexts.push(extensionContext);
				if (extensionContext.dateString === "2026-07-14") {
					const replacement = extensionContext.document.createElement("span");
					replacement.className = "example-grid-overflow-content";
					replacement.textContent = `Wide ${extensionContext.hiddenEventCount}`;
					return replacement;
				}
				return extensionContext.dateString === "2026-07-15" ? null : undefined;
			}
		}],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onEventActivate: () => undefined
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(contexts.map((extensionContext) => extensionContext.dateString), [
		"2026-07-14",
		"2026-07-15",
		"2026-07-16"
	]);
	for (const extensionContext of contexts) {
		assert.equal(extensionContext.document, dom.window.document);
		assert.equal(extensionContext.surface, "grid-summary");
		assert.equal(extensionContext.eventCount, 2);
		assert.equal(extensionContext.hiddenEventCount, 1);
		assert.equal(extensionContext.signal.aborted, false);
		assert.equal(Object.isFrozen(extensionContext), true);
		assert.equal(Object.isFrozen(extensionContext.date), true);
		const defaultContent = getGridOverflowButton(host, extensionContext.dateString)
			.querySelector<HTMLElement>(":scope > .lfc-calendar-grid-more-default-content");
		assert.ok(defaultContent);
		assert.equal(defaultContent.textContent, extensionContext.text);
		assert.equal(defaultContent.childNodes.length, 1);
		assert.equal(defaultContent.firstChild?.nodeType, dom.window.Node.TEXT_NODE);
	}
	const customButton = getGridOverflowButton(host, "2026-07-14");
	const customSlot = customButton.querySelector<HTMLElement>(
		":scope > .lfc-calendar-grid-more-custom-content"
	);
	assert.ok(customSlot);
	assert.equal(customSlot.getAttribute("aria-hidden"), "true");
	assert.ok(customSlot.querySelector(":scope > .example-grid-overflow-content"));
	assert.equal(customButton.classList.contains("lfc-has-custom-grid-overflow-content"), true);
	assert.ok((customButton.getAttribute("aria-label") ?? "").trim().length > 0);
	for (const dateString of ["2026-07-15", "2026-07-16"]) {
		const button = getGridOverflowButton(host, dateString);
		const slot = button.querySelector<HTMLElement>(
			":scope > .lfc-calendar-grid-more-custom-content"
		);
		assert.ok(slot);
		assert.equal(slot.getAttribute("aria-hidden"), "true");
		assert.equal(slot.childNodes.length, 0);
		assert.equal(button.classList.contains("lfc-has-custom-grid-overflow-content"), false);
	}

	calendar.destroy();
	assert.ok(contexts.every((extensionContext) => extensionContext.signal.aborted));
	assert.equal(customButton.classList.contains("lfc-has-custom-grid-overflow-content"), false);
	assert.equal(customSlot.childNodes.length, 0);
});

for (const outputKind of ["empty fragment", "comment"] as const) {
	void test(`nonvisual singleton ${outputKind} output retains canonical visual fallbacks`, async (context) => {
		const { host } = setupDom(context);
		const createOutput = (ownerDocument: Document): Node => outputKind === "empty fragment"
			? ownerDocument.createDocumentFragment()
			: ownerDocument.createComment("nonvisual");
		const calendar = createCalendar(host, {
			events: [
				event("first", "2026-07-14T09:00", "First event"),
				event("second", "2026-07-14T10:00", "Second event")
			],
			extensions: [{
				id: `nonvisual-singletons-${outputKind}`,
				renderGridOverflowContent: ({ document: ownerDocument }) => createOutput(ownerDocument),
				renderMultipleEventIndicator: ({ document: ownerDocument }) => createOutput(ownerDocument)
			}],
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1
		});

		calendar.render();
		await waitForPhase(calendar, "ready");

		assert.equal(
			getMultipleEventIndicator(host, "2026-07-14")
				.querySelectorAll(":scope > .lfc-calendar-multiple-event-indicator-icon").length,
			1
		);
		const overflow = getGridOverflowButton(host, "2026-07-14");
		const customContent = overflow.querySelector<HTMLElement>(
			":scope > .lfc-calendar-grid-more-custom-content"
		);
		const defaultContent = overflow.querySelector<HTMLElement>(
			":scope > .lfc-calendar-grid-more-default-content"
		);
		assert.ok(customContent);
		assert.equal(customContent.childNodes.length, 0);
		assert.equal(overflow.classList.contains("lfc-has-custom-grid-overflow-content"), false);
		assert.ok(defaultContent);
		assert.ok((defaultContent.textContent ?? "").trim().length > 0);
	});
}

void test("a quarantined grid-overflow renderer restores every canonical fallback", async (context) => {
	const { host } = setupDom(context);
	let calls = 0;
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [
			event("first-a", "2026-07-14T09:00", "First day one"),
			event("first-b", "2026-07-14T10:00", "First day two"),
			event("second-a", "2026-07-15T09:00", "Second day one"),
			event("second-b", "2026-07-15T10:00", "Second day two")
		],
		extensions: [{
			id: "failing-grid-overflow",
			renderGridOverflowContent: ({ document: ownerDocument }) => {
				calls += 1;
				if (calls === 2) {
					throw new Error("private grid-overflow failure");
				}
				const replacement = ownerDocument.createElement("span");
				replacement.className = "temporary-grid-overflow-content";
				return replacement;
			}
		}],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onError: (error) => {
			captured = error;
		}
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.equal(calls, 2);
	assert.equal(captured?.hook, "renderGridOverflowContent");
	assert.equal(captured?.surface, "grid-summary");
	assert.equal(host.querySelector(".temporary-grid-overflow-content"), null);
	for (const dateString of ["2026-07-14", "2026-07-15"]) {
		const button = getGridOverflowButton(host, dateString);
		const customContent = button.querySelector<HTMLElement>(
			":scope > .lfc-calendar-grid-more-custom-content"
		);
		const defaultContent = button.querySelector<HTMLElement>(
			":scope > .lfc-calendar-grid-more-default-content"
		);
		assert.ok(customContent);
		assert.equal(customContent.childNodes.length, 0);
		assert.ok(defaultContent);
		assert.ok((defaultContent.textContent ?? "").trim().length > 0);
		assert.equal(button.classList.contains("lfc-has-custom-grid-overflow-content"), false);
	}
	assert.doesNotMatch(
		host.textContent ?? "",
		/private grid-overflow failure|failing-grid-overflow/u
	);
});

void test("the singleton day visuals reject interactive output and retain package defaults", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: [
			event("first", "2026-07-14T09:00", "First event"),
			event("second", "2026-07-14T10:00", "Second event")
		],
		extensions: [
			{
				id: "interactive-multiple-event-indicator",
				renderMultipleEventIndicator: ({ document: ownerDocument }) =>
					ownerDocument.createElement("button")
			},
			{
				id: "interactive-grid-overflow-content",
				renderGridOverflowContent: ({ document: ownerDocument }) =>
					ownerDocument.createElement("button")
			}
		],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onError: (error) => {
			errors.push(error);
		}
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.deepEqual(errors.map(({ hook }) => hook), [
		"renderMultipleEventIndicator",
		"renderGridOverflowContent"
	]);
	assert.equal(
		getMultipleEventIndicator(host, "2026-07-14")
			.querySelectorAll(":scope > .lfc-calendar-multiple-event-indicator-icon").length,
		1
	);
	const overflow = getGridOverflowButton(host, "2026-07-14");
	assert.equal(
		overflow.querySelector(":scope > .lfc-calendar-grid-more-custom-content")?.childNodes.length,
		0
	);
	assert.equal(overflow.classList.contains("lfc-has-custom-grid-overflow-content"), false);
	assert.ok(
		(overflow.querySelector(":scope > .lfc-calendar-grid-more-default-content")?.textContent ?? "")
			.trim().length > 0
	);
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

function getMultipleEventIndicator(host: HTMLElement, dateString: string): HTMLElement {
	const button = host.querySelector<HTMLButtonElement>(
		`.lfc-calendar-day-button[data-lfc-date='${dateString}']`
	);
	assert.ok(button, `Expected the ${dateString} day button to exist.`);
	const indicator = button.closest("[role='gridcell']")?.querySelector<HTMLElement>(
		".lfc-calendar-multiple-event-indicator"
	);
	assert.ok(indicator, `Expected the ${dateString} multiple-event indicator slot to exist.`);
	return indicator;
}

function getGridOverflowButton(host: HTMLElement, dateString: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(
		`.lfc-calendar-grid-more[data-lfc-date='${dateString}']`
	);
	assert.ok(button, `Expected the ${dateString} grid-overflow button to exist.`);
	return button;
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
