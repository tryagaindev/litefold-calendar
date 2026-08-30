import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventOverflowContext,
	type CalendarEventInput,
	type CalendarRenderHooks,
	type LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	installDom,
	waitFor
} from "./helpers/dom.js";

void test("render-hook sets are ordered, isolated, and completely cleaned up", async (context) => {
	const { dom, host } = setupDom(context);
	const hookOrder: string[] = [];
	const lifecycleSignals: AbortSignal[] = [];
	let cleanups = 0;
	const errors: LitefoldCalendarError[] = [];
	const renderHooks: readonly CalendarRenderHooks[] = [
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
			id: "private-render-hook-identifier",
			renderEventDetails: () => {
				hookOrder.push("failing");
				throw new Error("private render-hook details");
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
		events: async () => [event("render-hook-event", "2026-07-14", "Extended")],
		renderHooks,
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
	assert.doesNotMatch(host.textContent ?? "", /private-render-hook-identifier|private render-hook details/);
	assert.equal(errors.filter((error) => error.code === "render-hook-failed").length, 1);
	const failingCalls = hookOrder.filter((name) => name === "failing").length;
	calendar.focusDate("2026-07-14");
	assert.equal(hookOrder.filter((name) => name === "failing").length, failingCalls, "A quarantined render-hook set must not run again.");

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
		renderHooks: [{
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
		renderHooks: [{
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

	assert.equal(captured?.code, "render-hook-failed");
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
		renderHooks: [{
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
		renderHooks: [{
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
		renderHooks: [{
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
		renderHooks: [{
			id: "reparenting-marker",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-reparenting-marker")
		}],
		initialDate: "2026-07-14",
		onError: (error) => { captured = error; }
	});

	calendar.render();
	await waitFor(() => captured !== undefined);

	assert.equal(captured?.code, "render-hook-failed");
	assert.equal(captured?.hook, "renderEventMarker");
	assert.ok(detachedTarget.querySelectorAll("lfc-reparenting-marker").length > 0);
	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.equal(markerSlots.length, 2);
	assert.ok(markerSlots.every((marker) => marker.querySelector(".lfc-calendar-event-accent") !== null));
});

void test("connected render-hook output cannot add interactive descendants", async (context) => {
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
		renderHooks: [{
			id: "interactive-marker",
			renderEventMarker: ({ document: ownerDocument }) =>
				ownerDocument.createElement("lfc-interactive-marker")
		}],
		initialDate: "2026-07-14",
		onError: (error) => { captured = error; }
	});

	calendar.render();
	await waitFor(() => captured !== undefined);

	assert.equal(captured?.code, "render-hook-failed");
	assert.equal(captured?.hook, "renderEventMarker");
	assert.equal(host.querySelector("lfc-interactive-marker"), null);
	assert.equal(host.querySelector(".lfc-calendar-event-marker button"), null);
	const markerSlots = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-marker")];
	assert.equal(markerSlots.length, 2);
	assert.ok(markerSlots.every((marker) => marker.querySelector(".lfc-calendar-event-accent") !== null));
});

void test("built-in event-overflow variants use adaptive counts independently of the grid cap", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [
			event("single", "2026-07-13T09:00", "Single event"),
			...eventsForDate("2026-07-14", 4, "multiple")
		],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 2,
		onEventActivate: () => undefined
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(findCompactOverflowRoot(host, "2026-07-12"), null);
	assert.equal(findCompactOverflowRoot(host, "2026-07-13"), null);
	const compact = getCompactOverflowRoot(host, "2026-07-14");
	assert.equal(compact.getAttribute("aria-hidden"), "true");
	assert.equal(getOverflowContent(compact).textContent, "+3");
	const wide = getWideOverflowRoot(host, "2026-07-14");
	assert.equal(getOverflowContent(wide).textContent, "2 more");
	const overflow = getGridOverflowButton(host, "2026-07-14");
	assert.ok((overflow.getAttribute("aria-label") ?? "").trim().length > 0);
});

void test("renderEventOverflow receives both frozen variants and stable element references", async (context) => {
	const { dom, host } = setupDom(context);
	const contexts: Readonly<CalendarEventOverflowContext>[] = [];
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 4, "context"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 2,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "overflow-context",
			renderEventOverflow: (renderContext) => {
				contexts.push(renderContext);
				return undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(contexts.map(({ variant }) => variant), ["compact", "wide"]);
	const [compact, wide] = contexts;
	assert.ok(compact?.variant === "compact");
	assert.equal(compact.document, dom.window.document);
	assert.equal(compact.surface, "day");
	assert.equal(compact.eventCount, 4);
	assert.equal(compact.visibleEventCount, 1);
	assert.equal(compact.overflowCount, 3);
	assert.equal(compact.text, "+3");
	assert.equal(compact.elements.action, null);
	assert.equal(compact.elements.root.contains(compact.elements.content), true);
	assert.equal(compact.elements.content.textContent, compact.text);

	assert.ok(wide?.variant === "wide");
	assert.equal(wide.document, dom.window.document);
	assert.equal(wide.surface, "grid-summary");
	assert.equal(wide.eventCount, 4);
	assert.equal(wide.visibleEventCount, 2);
	assert.equal(wide.overflowCount, 2);
	assert.equal(wide.text, "2 more");
	assert.equal(wide.elements.action, getGridOverflowButton(host, "2026-07-14"));
	assert.equal(wide.elements.root.contains(wide.elements.content), true);
	assert.equal(wide.elements.action.contains(wide.elements.root), true);
	assert.equal(wide.elements.content.textContent, wide.text);

	for (const renderContext of contexts) {
		assert.equal(renderContext.signal.aborted, false);
		assert.equal(Object.isFrozen(renderContext), true);
		assert.equal(Object.isFrozen(renderContext.date), true);
		assert.equal(Object.isFrozen(renderContext.elements), true);
		assert.deepEqual(renderContext.date, { day: 14, month: 7, year: 2026 });
	}

	calendar.destroy();
	assert.ok(contexts.every((renderContext) => renderContext.signal.aborted));
});

void test("renderEventOverflow skips out-of-range structural days", async (context) => {
	const { host } = setupDom(context);
	const calls: string[] = [];
	const calendar = createCalendar(host, {
		events: [
			...eventsForDate("2026-07-13", 2, "outside"),
			...eventsForDate("2026-07-14", 2, "inside")
		],
		initialDate: "2026-07-14",
		maxDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		minDate: "2026-07-14",
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "range-aware-overflow",
			renderEventOverflow: ({ dateString, variant }) => {
				calls.push(`${dateString}:${variant}`);
				return undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(calls, ["2026-07-14:compact", "2026-07-14:wide"]);
	assert.equal(findCompactOverflowRoot(host, "2026-07-13"), null);
	assert.equal(getOverflowContent(getCompactOverflowRoot(host, "2026-07-14")).textContent, "+1");
});

void test("renderEventOverflow supports custom, null, and undefined results in both variants", async (context) => {
	const { host } = setupDom(context);
	const contexts: Readonly<CalendarEventOverflowContext>[] = [];
	const calendar = createCalendar(host, {
		events: [
			...eventsForDate("2026-07-14", 2, "custom"),
			...eventsForDate("2026-07-15", 2, "null"),
			...eventsForDate("2026-07-16", 2, "default")
		],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "overflow-presentations",
			renderEventOverflow: (renderContext) => {
				contexts.push(renderContext);
				if (renderContext.dateString === "2026-07-14") {
					const replacement = renderContext.document.createElement("span");
					replacement.className = `example-${renderContext.variant}-overflow`;
					replacement.textContent = `${renderContext.variant}:${renderContext.text}`;
					return replacement;
				}
				return renderContext.dateString === "2026-07-15" ? null : undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(contexts.map(({ dateString, variant }) => `${dateString}:${variant}`), [
		"2026-07-14:compact",
		"2026-07-14:wide",
		"2026-07-15:compact",
		"2026-07-15:wide",
		"2026-07-16:compact",
		"2026-07-16:wide"
	]);
	const customContexts = contexts.filter(({ dateString }) => dateString === "2026-07-14");
	for (const renderContext of customContexts) {
		assert.equal(
			renderContext.elements.content.querySelector(`.example-${renderContext.variant}-overflow`)?.textContent,
			`${renderContext.variant}:${renderContext.text}`
		);
		assert.equal(renderContext.elements.root.classList.contains("lfc-has-custom-event-overflow"), true);
	}
	const nullCompact = contexts.find(({ dateString, variant }) =>
		dateString === "2026-07-15" && variant === "compact");
	assert.ok(nullCompact?.variant === "compact");
	assert.equal(nullCompact.elements.action, null);
	assert.equal(nullCompact.elements.content.textContent, "");
	assert.equal(nullCompact.elements.root.classList.contains("lfc-is-event-overflow-suppressed"), true);
	const nullWide = contexts.find(({ dateString, variant }) =>
		dateString === "2026-07-15" && variant === "wide");
	assert.ok(nullWide?.variant === "wide");
	assert.equal(nullWide.elements.content.textContent, nullWide.text);
	assert.equal(nullWide.elements.root.classList.contains("lfc-is-event-overflow-suppressed"), false);
	for (const renderContext of contexts.filter(({ dateString }) => dateString === "2026-07-16")) {
		assert.equal(renderContext.elements.content.textContent, renderContext.text);
		assert.equal(renderContext.elements.root.classList.contains("lfc-has-custom-event-overflow"), false);
	}
});

void test("a suppressed or absent primary marker makes the compact count standalone", async (context) => {
	const { host } = setupDom(context);
	const compactContexts: Readonly<CalendarEventOverflowContext>[] = [];
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "markerless"),
		initialDate: "2026-07-14",
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "markerless-overflow",
			renderEventMarker: () => null,
			renderEventOverflow: (renderContext) => {
				if (renderContext.variant === "compact") {
					compactContexts.push(renderContext);
				}
				return undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(compactContexts.length, 1);
	const [compact] = compactContexts;
	assert.ok(compact?.variant === "compact");
	assert.equal(compact.visibleEventCount, 0);
	assert.equal(compact.overflowCount, 2);
	assert.equal(compact.text, "2");
	assert.equal(compact.elements.action, null);
	assert.equal(compact.elements.content.textContent, "2");
});

void test("static multi-event days show a standalone total without creating a wide action", async (context) => {
	const { host } = setupDom(context);
	const contexts: Readonly<CalendarEventOverflowContext>[] = [];
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "static"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 2,
		renderHooks: [{
			id: "static-overflow",
			renderEventOverflow: (renderContext) => {
				contexts.push(renderContext);
				return undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(contexts.map(({ variant }) => variant), ["compact"]);
	const [compact] = contexts;
	assert.ok(compact?.variant === "compact");
	assert.equal(compact.visibleEventCount, 0);
	assert.equal(compact.overflowCount, 2);
	assert.equal(compact.text, "2");
	assert.equal(compact.elements.action, null);
	assert.equal(host.querySelector(".lfc-calendar-grid-more"), null);
});

void test("a compact-primary overflow action retains its fallback when customization returns null", async (context) => {
	const { host } = setupDom(context);
	const contexts: Readonly<CalendarEventOverflowContext>[] = [];
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "zero-cap"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 0,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "zero-cap-overflow",
			renderEventOverflow: (renderContext) => {
				contexts.push(renderContext);
				return null;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(contexts.map(({ variant }) => variant), ["compact", "wide"]);
	const [compact, wide] = contexts;
	assert.ok(compact?.variant === "compact");
	assert.equal(compact.visibleEventCount, 0);
	assert.equal(compact.overflowCount, 2);
	assert.equal(compact.text, "2");
	assert.equal(compact.elements.action, getGridOverflowButton(host, "2026-07-14"));
	assert.equal(compact.elements.content.textContent, "2");
	assert.equal(compact.elements.root.classList.contains("lfc-is-event-overflow-suppressed"), false);
	assert.ok(wide?.variant === "wide");
	assert.equal(wide.visibleEventCount, 0);
	assert.equal(wide.overflowCount, 2);
	assert.equal(wide.elements.content.textContent, wide.text);

	compact.elements.action.click();
	assert.deepEqual(calendar.getState().selectedDate, { day: 14, month: 7, year: 2026 });
	assert.match(getAgenda(host).textContent ?? "", /zero-cap/u);
});

void test("a wide overflow failure quarantines the unified hook and restores every variant fallback", async (context) => {
	const { host } = setupDom(context);
	const calls: string[] = [];
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: [
			...eventsForDate("2026-07-14", 2, "first"),
			...eventsForDate("2026-07-15", 3, "second")
		],
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onError: (error) => { captured = error; },
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "failing-unified-overflow",
			renderEventOverflow: ({ dateString, document: ownerDocument, variant }) => {
				calls.push(`${dateString}:${variant}`);
				if (dateString === "2026-07-15" && variant === "wide") {
					throw new Error("private unified overflow failure");
				}
				const replacement = ownerDocument.createElement("span");
				replacement.className = "temporary-event-overflow";
				return replacement;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.deepEqual(calls, [
		"2026-07-14:compact",
		"2026-07-14:wide",
		"2026-07-15:compact",
		"2026-07-15:wide"
	]);
	assert.equal(captured?.hook, "renderEventOverflow");
	assert.equal(captured?.surface, "grid-summary");
	assert.equal(host.querySelector(".temporary-event-overflow"), null);
	assert.equal(getOverflowContent(getCompactOverflowRoot(host, "2026-07-14")).textContent, "+1");
	assert.equal(getOverflowContent(getWideOverflowRoot(host, "2026-07-14")).textContent, "1 more");
	assert.equal(getOverflowContent(getCompactOverflowRoot(host, "2026-07-15")).textContent, "+2");
	assert.equal(getOverflowContent(getWideOverflowRoot(host, "2026-07-15")).textContent, "2 more");
	assert.ok([...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-overflow")]
		.every((root) => !root.classList.contains("lfc-has-custom-event-overflow")));
	assert.doesNotMatch(
		host.textContent ?? "",
		/private unified overflow failure|failing-unified-overflow/u
	);
});

void test("one node cannot be reused across compact and wide overflow variants", async (context) => {
	const { dom, host } = setupDom(context);
	const shared = dom.window.document.createElement("span");
	shared.className = "shared-event-overflow";
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "shared"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onError: (error) => { captured = error; },
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "reused-overflow-node",
			renderEventOverflow: () => shared
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.equal(captured?.hook, "renderEventOverflow");
	assert.equal(captured?.surface, "grid-summary");
	assert.equal(host.querySelector(".shared-event-overflow"), null);
	assert.equal(getOverflowContent(getCompactOverflowRoot(host, "2026-07-14")).textContent, "+1");
	assert.equal(getOverflowContent(getWideOverflowRoot(host, "2026-07-14")).textContent, "1 more");
});

for (const invalidVariant of ["compact", "wide"] as const) {
	void test(`interactive ${invalidVariant} overflow output quarantines the unified hook`, async (context) => {
		const { host } = setupDom(context);
		const errors: LitefoldCalendarError[] = [];
		const calendar = createCalendar(host, {
			events: eventsForDate("2026-07-14", 2, `interactive-${invalidVariant}`),
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1,
			onError: (error) => { errors.push(error); },
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `interactive-${invalidVariant}-overflow`,
				renderEventOverflow: ({ document: ownerDocument, variant }) =>
					variant === invalidVariant ? ownerDocument.createElement("button") : undefined
			}]
		});

		calendar.render();
		await waitForPhase(calendar, "degraded");

		assert.equal(errors.length, 1);
		assert.equal(errors[0]?.hook, "renderEventOverflow");
		assert.equal(errors[0]?.surface, invalidVariant === "compact" ? "day" : "grid-summary");
		assert.equal(getOverflowContent(getCompactOverflowRoot(host, "2026-07-14")).textContent, "+1");
		assert.equal(getOverflowContent(getWideOverflowRoot(host, "2026-07-14")).textContent, "1 more");
		assert.equal(host.querySelector(".lfc-calendar-event-overflow button"), null);
	});
}

for (const outputKind of ["empty fragment", "comment", "template"] as const) {
	void test(`nonvisual ${outputKind} overflow output retains both canonical fallbacks`, async (context) => {
		const { host } = setupDom(context);
		const createOutput = (ownerDocument: Document): Node => {
			if (outputKind === "empty fragment") {
				return ownerDocument.createDocumentFragment();
			}
			if (outputKind === "comment") {
				return ownerDocument.createComment("nonvisual");
			}
			const template = ownerDocument.createElement("template");
			template.content.append(ownerDocument.createElement("span"));
			return template;
		};
		const calendar = createCalendar(host, {
			events: eventsForDate("2026-07-14", 2, `nonvisual-${outputKind}`),
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1,
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `nonvisual-overflow-${outputKind}`,
				renderEventOverflow: ({ document: ownerDocument }) => createOutput(ownerDocument)
			}]
		});

		calendar.render();
		await waitForPhase(calendar, "ready");

		assert.equal(getOverflowContent(getCompactOverflowRoot(host, "2026-07-14")).textContent, "+1");
		assert.equal(getOverflowContent(getWideOverflowRoot(host, "2026-07-14")).textContent, "1 more");
		assert.ok([...host.querySelectorAll<HTMLElement>(".lfc-calendar-event-overflow")]
			.every((root) => !root.classList.contains("lfc-has-custom-event-overflow")));
	});
}

void test("a template plus visible fragment child is accepted as overflow content", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "visible-fragment"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "visible-template-fragment",
			renderEventOverflow: ({ document: ownerDocument, variant }) => {
				if (variant === "compact") {
					return undefined;
				}
				const fragment = ownerDocument.createDocumentFragment();
				const template = ownerDocument.createElement("template");
				template.content.append(ownerDocument.createElement("span"));
				const visible = ownerDocument.createElement("span");
				visible.className = "example-visible-template-sibling";
				visible.textContent = "Visible";
				fragment.append(template, visible);
				return fragment;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	const wide = getWideOverflowRoot(host, "2026-07-14");
	assert.equal(wide.classList.contains("lfc-has-custom-event-overflow"), true);
	assert.equal(getOverflowContent(wide).querySelector(".example-visible-template-sibling")?.textContent, "Visible");
});

for (const mutation of ["append-sibling", "remove-ancestor"] as const) {
	void test(`connected wide-overflow output cannot ${mutation}`, async (context) => {
		const { dom, host } = setupDom(context);
		const tagName = `lfc-overflow-${mutation}`;
		class MutatingOverflowElement extends dom.window.HTMLElement {
			public connectedCallback(): void {
				const root = this.parentElement?.parentElement;
				if (mutation === "append-sibling") {
					root?.append(dom.window.document.createElement("button"));
				} else {
					root?.remove();
				}
			}
		}
		dom.window.customElements.define(tagName, MutatingOverflowElement);
		const errors: LitefoldCalendarError[] = [];
		const calendar = createCalendar(host, {
			events: eventsForDate("2026-07-15", 2, `mutating-${mutation}`),
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1,
			onError: (error) => { errors.push(error); },
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `mutating-overflow-${mutation}`,
				renderEventOverflow: ({ document: ownerDocument, variant }) =>
					variant === "wide" ? ownerDocument.createElement(tagName) : undefined
			}]
		});

		calendar.render();
		await waitForPhase(calendar, "degraded");

		assert.equal(errors.length, 1);
		assert.equal(errors[0]?.hook, "renderEventOverflow");
		assert.equal(errors[0]?.surface, "grid-summary");
		const overflow = getGridOverflowButton(host, "2026-07-15");
		assert.equal(overflow.querySelector(tagName), null);
		assert.equal(getOverflowContent(getWideOverflowRoot(host, "2026-07-15")).textContent, "1 more");
		overflow.click();
		assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
		assert.match(getAgenda(host).textContent ?? "", /mutating/u);
	});
}

void test("connected custom overflow output may extend only its own noninteractive subtree", async (context) => {
	const { dom, host } = setupDom(context);
	class SelfContainedOverflowElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			const content = dom.window.document.createElement("span");
			content.textContent = "Custom overflow";
			this.append(content);
		}
	}
	dom.window.customElements.define("lfc-self-contained-overflow", SelfContainedOverflowElement);
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "self-contained"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "self-contained-overflow",
			renderEventOverflow: ({ document: ownerDocument, variant }) =>
				variant === "wide" ? ownerDocument.createElement("lfc-self-contained-overflow") : undefined
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	const wide = getWideOverflowRoot(host, "2026-07-14");
	assert.equal(wide.querySelector("lfc-self-contained-overflow")?.textContent, "Custom overflow");
	assert.equal(wide.classList.contains("lfc-has-custom-event-overflow"), true);
});

void test("renderEventLeading contains text nodes in a compact-hideable wrapper", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [event("text-leading", "2026-07-14T09:00", "Text leading")],
		renderHooks: [{
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

void test("cross-document render-hook nodes are rejected without taking down core UI", async (context) => {
	const { host } = setupDom(context);
	const foreignDom = createDom('<div id="foreign"></div>');
	context.after(() => {
		foreignDom.window.close();
	});
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: async () => [event("safe", "2026-07-14", "Core event")],
		renderHooks: [{
			id: "foreign-node",
			renderEventDetails: () => foreignDom.window.document.createElement("span")
		}],
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitFor(() => captured?.code === "render-hook-failed", "cross-document render-hook error");
	assert.ok(captured);
	assert.match(getAgenda(host).textContent ?? "", /Core event/);
	assert.equal(calendar.getState().phase, "degraded");
});

void test("render-hook cleanup failures quarantine the hook set while preserving calendar data", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: async () => [event("cleanup", "2026-07-14", "Preserved event")],
		renderHooks: [{
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
	await waitFor(() => errors.some((error) => error.hook === "cleanup"), "render-hook cleanup failure");

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

function eventsForDate(
	dateString: string,
	count: number,
	idPrefix: string
): readonly CalendarEventInput[] {
	return Array.from({ length: count }, (_, index) => event(
		`${idPrefix}-${index.toString()}`,
		`${dateString}T09:00`,
		`${idPrefix} ${index.toString()}`
	));
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

function getCompactOverflowRoot(host: HTMLElement, dateString: string): HTMLElement {
	const root = findCompactOverflowRoot(host, dateString);
	assert.ok(root, `Expected the ${dateString} compact overflow root to exist.`);
	return root;
}

function findCompactOverflowRoot(host: HTMLElement, dateString: string): HTMLElement | null {
	const button = host.querySelector<HTMLButtonElement>(
		`.lfc-calendar-day-button[data-lfc-date='${dateString}']`
	);
	assert.ok(button, `Expected the ${dateString} day button to exist.`);
	return button.closest("[role='gridcell']")?.querySelector<HTMLElement>(
		".lfc-calendar-event-overflow.lfc-is-compact"
	) ?? null;
}

function getGridOverflowButton(host: HTMLElement, dateString: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(
		`.lfc-calendar-grid-more[data-lfc-date='${dateString}']`
	);
	assert.ok(button, `Expected the ${dateString} grid-overflow button to exist.`);
	return button;
}

function getOverflowContent(root: HTMLElement): HTMLElement {
	const content = root.querySelector<HTMLElement>(
		":scope > .lfc-calendar-event-overflow-content"
	);
	assert.ok(content, "Expected the event-overflow content slot to exist.");
	return content;
}

function getWideOverflowRoot(host: HTMLElement, dateString: string): HTMLElement {
	const root = getGridOverflowButton(host, dateString).querySelector<HTMLElement>(
		":scope > .lfc-calendar-event-overflow.lfc-is-wide"
	);
	assert.ok(root, `Expected the ${dateString} wide overflow root to exist.`);
	return root;
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
