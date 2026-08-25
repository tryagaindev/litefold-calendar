import assert from "node:assert/strict";
import test from "node:test";

import {
	createAgendaPresentation,
	type AgendaEventEntry
} from "../src/internal/dom/agenda.js";
import { createDom } from "./helpers/dom.js";

void test("agenda presentation keeps unavailable and empty states detached and text-safe", () => {
	const dom = createDom();
	const document = dom.window.document;
	const ignoredRoot = document.createElement("a");
	ignoredRoot.href = "/ignored";
	const unavailable = createAgendaPresentation({
		document,
		emptyText: "No events",
		entries: [entry("ignored", ignoredRoot)],
		hasSnapshot: false,
		moreText: "Show more",
		progressText: "Showing 1 of 2",
		titleText: "Agenda unavailable",
		totalEventCount: 2
	});

	assert.equal(Object.isFrozen(unavailable), true);
	assert.equal(Object.isFrozen(unavailable.listItems), true);
	assert.equal(Object.isFrozen(unavailable.footerChildren), true);
	assert.equal(Object.isFrozen(unavailable.actionReferences), true);
	assert.equal(unavailable.titleText, "Agenda unavailable");
	assert.equal(unavailable.listHidden, true);
	assert.deepEqual(unavailable.listItems, []);
	assert.deepEqual(unavailable.footerChildren, []);
	assert.deepEqual(unavailable.actionReferences, []);
	assert.equal(unavailable.moreButton, null);
	assert.equal(ignoredRoot.parentNode, null);

	const hostileTitle = '</h2><script>globalThis.compromised=true</script>';
	const hostileEmpty = '<img src="x" onerror="globalThis.compromised=true">';
	const empty = createAgendaPresentation({
		document,
		emptyText: hostileEmpty,
		entries: [],
		hasSnapshot: true,
		moreText: null,
		progressText: null,
		titleText: hostileTitle,
		totalEventCount: 0
	});

	assert.equal(empty.titleText, hostileTitle);
	assert.equal(empty.listHidden, true);
	assert.equal(empty.listItems.length, 0);
	assert.equal(empty.footerChildren.length, 1);
	assert.equal(empty.footerChildren[0]?.className, "lfc-calendar-agenda-empty");
	assert.equal(empty.footerChildren[0]?.textContent, hostileEmpty);
	assert.equal(empty.footerChildren[0]?.querySelector("img, script"), null);
	assert.equal(document.body.childElementCount, 1, "The presenter must not commit into the calendar shell.");
	assert.equal(Reflect.get(globalThis, "compromised"), undefined);
	dom.window.close();
});

void test("agenda presentation returns ordered list entries, native paging, progress, and action references", () => {
	const dom = createDom();
	const document = dom.window.document;
	const link = document.createElement("a");
	link.href = "/events/linked";
	link.textContent = "Linked";
	const staticEvent = document.createElement("div");
	staticEvent.textContent = "Static";
	const hostileMore = 'Show 3 <img src="x" onerror="globalThis.compromised=true">';
	const hostileProgress = "Showing 2 of 5 </p><script>globalThis.compromised=true</script>";
	const presentation = createAgendaPresentation({
		document,
		emptyText: "No events",
		entries: [entry("linked", link), entry("static", staticEvent)],
		hasSnapshot: true,
		moreText: hostileMore,
		progressText: hostileProgress,
		titleText: "Tuesday agenda",
		totalEventCount: 5
	});

	assert.equal(presentation.listHidden, false);
	assert.equal(presentation.listItems.length, 2);
	assert.ok(presentation.listItems.every((item) => item.className === "lfc-calendar-agenda-item"));
	assert.equal(presentation.listItems[0]?.firstChild, link);
	assert.equal(presentation.listItems[1]?.firstChild, staticEvent);
	assert.equal(presentation.actionReferences.length, 1);
	assert.equal(presentation.actionReferences[0]?.eventId, "linked");
	assert.equal(presentation.actionReferences[0]?.action, link);
	assert.equal(Object.isFrozen(presentation.actionReferences[0]), true);
	assert.ok(presentation.moreButton instanceof dom.window.HTMLButtonElement);
	assert.equal(presentation.moreButton.type, "button");
	assert.equal(presentation.moreButton.textContent, hostileMore);
	assert.equal(presentation.footerChildren[0], presentation.moreButton);
	assert.equal(presentation.footerChildren[1]?.className, "lfc-calendar-agenda-overflow");
	assert.equal(presentation.footerChildren[1]?.textContent, hostileProgress);
	assert.equal(presentation.footerChildren[0]?.querySelector("img, script"), null);
	assert.equal(presentation.footerChildren[1]?.querySelector("img, script"), null);
	assert.equal(Reflect.get(globalThis, "compromised"), undefined);
	dom.window.close();
});

void test("capped agenda presentation reports overflow without creating a paging action", () => {
	const dom = createDom();
	const document = dom.window.document;
	const staticEvent = document.createElement("div");
	const presentation = createAgendaPresentation({
		document,
		emptyText: "No events",
		entries: [entry("capped", staticEvent)],
		hasSnapshot: true,
		moreText: null,
		progressText: "Showing 50 of 75 events",
		titleText: "Agenda",
		totalEventCount: 75
	});

	assert.equal(presentation.listHidden, false);
	assert.equal(presentation.moreButton, null);
	assert.equal(presentation.footerChildren.length, 1);
	assert.equal(presentation.footerChildren[0]?.className, "lfc-calendar-agenda-overflow");
	assert.equal(presentation.footerChildren[0]?.textContent, "Showing 50 of 75 events");
	dom.window.close();
});

function entry(eventId: string, root: HTMLElement): Readonly<AgendaEventEntry> {
	const view = root.ownerDocument.defaultView;
	assert.ok(view);
	return Object.freeze({
		action: root instanceof view.HTMLAnchorElement ? root : null,
		eventId,
		root
	});
}
