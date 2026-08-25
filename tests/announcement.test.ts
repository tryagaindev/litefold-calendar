import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createCalendar, type CalendarEventInput } from "../src/index.js";
import {
	CalendarAnnouncementPresenter,
	type CalendarAnnouncementElements
} from "../src/internal/dom/announcement.js";
import { createDom, dispatchClick, getHost, installDom, waitFor } from "./helpers/dom.js";

void test("announcement presentation deduplicates exact requests and routes urgency", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const elements = createAnnouncementElements(dom.window.document);
	const presenter = new CalendarAnnouncementPresenter(elements);

	const politeUpdate = presenter.prepare({ message: "Updated", politeness: "polite" });
	assert.ok(politeUpdate);
	assert.equal(elements.politeLive.textContent, "");
	assert.equal(elements.assertiveLive.textContent, "");
	politeUpdate();
	assert.equal(elements.politeLive.textContent, "Updated");
	assert.equal(elements.assertiveLive.textContent, "");
	assert.equal(presenter.prepare({ message: "Updated", politeness: "polite" }), null);
	assert.equal(elements.politeLive.textContent, "Updated");

	const assertiveUpdate = presenter.prepare({ message: "Updated", politeness: "assertive" });
	assert.ok(assertiveUpdate);
	assert.equal(elements.politeLive.textContent, "");
	assert.equal(elements.assertiveLive.textContent, "");
	assertiveUpdate();
	assert.equal(elements.politeLive.textContent, "");
	assert.equal(elements.assertiveLive.textContent, "Updated");
});

void test("clearing removes both routes and resets announcement deduplication", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const elements = createAnnouncementElements(dom.window.document);
	const presenter = new CalendarAnnouncementPresenter(elements);
	const announcement = { message: "Try again", politeness: "assertive" } as const;
	const firstUpdate = presenter.prepare(announcement);
	assert.ok(firstUpdate);
	firstUpdate();

	presenter.clear();
	assert.equal(elements.politeLive.textContent, "");
	assert.equal(elements.assertiveLive.textContent, "");
	const repeatedUpdate = presenter.prepare(announcement);
	assert.ok(repeatedUpdate);
	repeatedUpdate();
	assert.equal(elements.assertiveLive.textContent, "Try again");
});

void test("the coordinator suppresses a stale queued announcement", async (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = getHost(dom);
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: Array.from({ length: 30 }, (_, index): CalendarEventInput => ({
			id: `event-${index.toString()}`,
			start: "2026-07-14",
			title: `Event ${index.toString()}`
		})),
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitFor(() => calendar.getState().phase === "ready", "ready calendar state");

	const queuedUpdates = captureQueuedMicrotasks(context);

	const firstMore = findAgendaMore(host);
	dispatchClick(dom, firstMore);
	const secondMore = findAgendaMore(host);
	dispatchClick(dom, secondMore);
	assert.equal(queuedUpdates.length, 2);
	const politeLive = host.querySelector<HTMLElement>("[role='status'][aria-live='polite']");
	assert.ok(politeLive);

	queuedUpdates[0]?.();
	assert.equal(politeLive.textContent, "");
	queuedUpdates[1]?.();
	assert.equal(politeLive.textContent, "Showing 30 of 30 events");
});

void test("destroy invalidates a queued announcement before detached DOM can change", async (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = getHost(dom);
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: Array.from({ length: 11 }, (_, index): CalendarEventInput => ({
			id: `event-${index.toString()}`,
			start: "2026-07-14",
			title: `Event ${index.toString()}`
		})),
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitFor(() => calendar.getState().phase === "ready", "ready calendar state");
	const politeLive = host.querySelector<HTMLElement>("[role='status'][aria-live='polite']");
	assert.ok(politeLive);

	const queuedUpdates = captureQueuedMicrotasks(context);
	dispatchClick(dom, findAgendaMore(host));
	assert.equal(queuedUpdates.length, 1);
	calendar.destroy();
	queuedUpdates[0]?.();

	assert.equal(politeLive.textContent, "");
	assert.equal(host.childElementCount, 0);
});

void test("clearing an unhandled issue permits the same Retry failure to be announced again", async (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = getHost(dom);
	let sourceCalls = 0;
	const calendar = createCalendar(host, {
		events: async () => {
			sourceCalls += 1;
			throw new Error("offline");
		},
		initialDate: "2026-07-14",
		onError: () => "default"
	});
	calendar.render();
	await waitFor(() => calendar.getState().phase === "unavailable", "initial source failure");
	const assertiveLive = host.querySelector<HTMLElement>("[role='alert'][aria-live='assertive']");
	assert.ok(assertiveLive);
	await waitFor(() => assertiveLive.textContent !== "", "initial source announcement");
	const firstMessage = assertiveLive.textContent;

	const queuedUpdates = captureQueuedMicrotasks(context);
	const retry = host.querySelector<HTMLButtonElement>(".lfc-calendar-retry:not([hidden])");
	assert.ok(retry);
	dispatchClick(dom, retry);
	await waitFor(
		() => sourceCalls === 2 && calendar.getState().phase === "unavailable",
		"repeated Retry failure"
	);

	assert.equal(assertiveLive.textContent, "");
	assert.equal(queuedUpdates.length, 1);
	queuedUpdates[0]?.();
	assert.equal(assertiveLive.textContent, firstMessage);
});

void test("a successful external announcer cancels an older queued internal fallback", async (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = getHost(dom);
	let announcementCalls = 0;
	const announcements: string[] = [];
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: Array.from({ length: 30 }, (_, index): CalendarEventInput => ({
			id: `event-${index.toString()}`,
			start: "2026-07-14",
			title: `Event ${index.toString()}`
		})),
		initialDate: "2026-07-14",
		onAnnounce: ({ message }) => {
			announcementCalls += 1;
			if (announcementCalls === 1) {
				throw new Error("external announcer unavailable");
			}
			announcements.push(message);
		},
		onError: () => "default"
	});
	calendar.render();
	await waitFor(() => calendar.getState().phase === "ready", "ready calendar state");
	const queuedUpdates = captureQueuedMicrotasks(context);

	dispatchClick(dom, findAgendaMore(host));
	dispatchClick(dom, findAgendaMore(host));
	assert.equal(announcementCalls, 2);
	assert.deepEqual(announcements, ["Showing 30 of 30 events"]);
	assert.equal(queuedUpdates.length, 1);
	const politeLive = host.querySelector<HTMLElement>("[role='status'][aria-live='polite']");
	assert.ok(politeLive);

	queuedUpdates[0]?.();
	assert.equal(politeLive.textContent, "");
	assert.equal(
		calendar.getState().issues.some((issue) => issue.code === "host-integration-failed"),
		false
	);
});

function createAnnouncementElements(document: Document): CalendarAnnouncementElements {
	const assertiveLive = document.createElement("p");
	const politeLive = document.createElement("p");
	document.body.append(politeLive, assertiveLive);
	return { assertiveLive, politeLive };
}

function findAgendaMore(host: HTMLElement): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(".lfc-calendar-agenda-more");
	assert.ok(button, "Expected an agenda paging control.");
	return button;
}

function captureQueuedMicrotasks(context: TestContext): (() => void)[] {
	const queuedUpdates: (() => void)[] = [];
	const originalQueueMicrotask = Object.getOwnPropertyDescriptor(globalThis, "queueMicrotask");
	Object.defineProperty(globalThis, "queueMicrotask", {
		configurable: true,
		value: (callback: () => void) => { queuedUpdates.push(callback); }
	});
	context.after(() => {
		if (originalQueueMicrotask === undefined) {
			Reflect.deleteProperty(globalThis, "queueMicrotask");
		} else {
			Object.defineProperty(globalThis, "queueMicrotask", originalQueueMicrotask);
		}
	});
	return queuedUpdates;
}
