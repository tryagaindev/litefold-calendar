import assert from "node:assert/strict";
import test from "node:test";

import {
	createEventRepresentation,
	type EventRepresentationInput
} from "../src/internal/dom/event-representation.js";
import {
	normalizeCalendarEvents,
	type NormalizedCalendarEvent
} from "../src/internal/domain/event-normalization.js";
import type { CalendarEventInput, CalendarEventSurface, CalendarEventTimeDisplay } from "../src/types.js";
import { createDom } from "./helpers/dom.js";

void test("event representations preserve native semantics, safe text, and extension slots", () => {
	const dom = createDom();
	const hostileTitle = '<img src="x" onerror="globalThis.compromised=true">';
	const hostileId = 'linked\"><script>globalThis.compromised=true</script>';
	const event = normalizeEvent({
		id: hostileId,
		start: "2026-07-14T09:00",
		title: hostileTitle,
		url: "/events/linked?from=calendar#details"
	});
	const accessibleLabel = 'Open <script>globalThis.compromised=true</script>';

	for (const surface of ["grid-summary", "agenda"] as const) {
		const representation = createEventRepresentation(Object.freeze({
			accessibleLabel,
			dateString: "2026-07-14",
			document: dom.window.document,
			event,
			hasApplicationAction: false,
			surface,
			timeDisplay: "all",
			timeText: "9:00 AM"
		} satisfies EventRepresentationInput));
		const { action, details, leading, marker, root, time, title, trailing } = representation.elements;

		assert.equal(Object.isFrozen(representation), true);
		assert.equal(Object.isFrozen(representation.elements), true);
		assert.equal(Object.isFrozen(representation.slots), true);
		assert.ok(root instanceof dom.window.HTMLAnchorElement);
		assert.equal(action, root);
		assert.equal(root.getAttribute("href"), "/events/linked?from=calendar#details");
		assert.equal(root.getAttribute("data-lfc-date"), "2026-07-14");
		assert.equal(root.getAttribute("data-lfc-event-id"), hostileId);
		assert.equal(root.getAttribute("data-lfc-surface"), surface);
		assert.equal(root.getAttribute("aria-label"), surface === "grid-summary" ? accessibleLabel : null);
		assert.equal(action?.tabIndex, surface === "grid-summary" ? -1 : 0);
		assert.deepEqual([...root.children], [leading, time, title, details, trailing]);
		assert.deepEqual([...leading.children], [marker, representation.slots.leadingContent]);
		assert.equal(time.dateTime, "2026-07-14T09:00");
		assert.equal(time.textContent, "9:00 AM");
		assert.equal(time.dir, "auto");
		assert.equal(title.textContent, hostileTitle);
		assert.equal(title.dir, "auto");
		assert.equal(root.querySelector("img, script"), null);

		representation.slots.leadingContent.append(dom.window.document.createTextNode("Priority"));
		details.append(dom.window.document.createTextNode("Room 4"));
		trailing.append(dom.window.document.createTextNode("Confirmed"));
		assert.equal(representation.slots.leadingContent.textContent, "Priority");
		assert.equal(details.textContent, "Room 4");
		assert.equal(trailing.textContent, "Confirmed");
	}

	assert.equal(Reflect.get(globalThis, "compromised"), undefined);
	dom.window.close();
});

void test("event representations select link, button, and static roots consistently across surfaces", () => {
	const dom = createDom();
	const linked = normalizeEvent({ id: "linked", start: "2026-07-14", title: "Linked", url: "/linked" });
	const unlinked = normalizeEvent({ id: "unlinked", start: "2026-07-14", title: "Unlinked" });

	for (const surface of ["grid-summary", "agenda"] as const) {
		const link = represent(dom.window.document, linked, surface, false, "all");
		const button = represent(dom.window.document, unlinked, surface, true, "all");
		const staticRepresentation = represent(dom.window.document, unlinked, surface, false, "all");

		assert.ok(link.elements.root instanceof dom.window.HTMLAnchorElement);
		assert.ok(button.elements.root instanceof dom.window.HTMLButtonElement);
		assert.equal(button.elements.root.type, "button");
		assert.equal(
			staticRepresentation.elements.root.tagName,
			surface === "grid-summary" ? "SPAN" : "DIV"
		);
		assert.equal(staticRepresentation.elements.action, null);
		assert.equal(staticRepresentation.elements.root.querySelector("a, button"), null);
	}

	dom.window.close();
});

void test("time display policy remains visual-only and keeps semantic time on both surfaces", () => {
	const dom = createDom();
	const event = normalizeEvent({ id: "timed", start: "2026-07-14T09:00", title: "Timed" });
	const cases = [
		{ display: "all", hidden: [] },
		{ display: "grid", hidden: ["agenda"] },
		{ display: "agenda", hidden: ["grid-summary"] },
		{ display: "none", hidden: ["agenda", "grid-summary"] }
	] as const satisfies readonly {
		readonly display: CalendarEventTimeDisplay;
		readonly hidden: readonly CalendarEventSurface[];
	}[];

	for (const testCase of cases) {
		const hiddenSurfaces: readonly CalendarEventSurface[] = testCase.hidden;
		for (const surface of ["grid-summary", "agenda"] as const) {
			const { time } = represent(
				dom.window.document,
				event,
				surface,
				false,
				testCase.display
			).elements;
			assert.ok(time instanceof dom.window.HTMLTimeElement);
			assert.equal(time.dateTime, "2026-07-14T09:00");
			assert.equal(time.textContent, "9:00 AM");
			assert.equal(time.hidden, false);
			assert.equal(time.getAttribute("aria-hidden"), null);
			assert.equal(
				time.classList.contains("lfc-visually-hidden"),
				hiddenSurfaces.includes(surface)
			);
		}
	}

	dom.window.close();
});

function represent(
	document: Document,
	event: Readonly<NormalizedCalendarEvent>,
	surface: CalendarEventSurface,
	hasApplicationAction: boolean,
	timeDisplay: CalendarEventTimeDisplay
) {
	return createEventRepresentation({
		accessibleLabel: "Event, Tuesday, July 14, 2026",
		dateString: "2026-07-14",
		document,
		event,
		hasApplicationAction,
		surface,
		timeDisplay,
		timeText: event.event.isAllDay ? "All day" : "9:00 AM"
	});
}

function normalizeEvent(input: Readonly<CalendarEventInput>): Readonly<NormalizedCalendarEvent> {
	const [event] = normalizeCalendarEvents([input], 1, "https://example.test/calendar");
	assert.ok(event);
	return event;
}
