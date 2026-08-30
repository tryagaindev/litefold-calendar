import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	LitefoldCalendarError
} from "../src/index.js";
import { createDom, installDom, waitFor } from "./helpers/dom.js";

void test("compact overflow text uses locale-aware social number formatting", async (context) => {
	const { host } = setupDom(context);
	const pairedEventCounts = new Map([
		["2026-07-13", 2],
		["2026-07-14", 1_000],
		["2026-07-15", 1_001],
		["2026-07-16", 1_251]
	]);
	const events = [
		...eventsForDate("2026-07-12", 2, "locale-standalone"),
		...[...pairedEventCounts].flatMap(([dateString, count]) =>
			eventsForDate(dateString, count, `locale-${dateString}`))
	];

	for (const locale of ["en-US", "ar-EG"] as const) {
		const compactTexts = new Map<string, string>();
		const calendar = createCalendar(host, {
			events,
			initialDate: "2026-07-14",
			locale,
			maxGridEventsPerDay: 1,
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `social-counts-${locale}`,
				renderEventMarker: ({ dateString, document: ownerDocument }) =>
					dateString === "2026-07-12" ? null : ownerDocument.createElement("span"),
				renderEventOverflow: ({ dateString, text, variant }) => {
					if (variant === "compact") {
						compactTexts.set(dateString, text);
					}
					return undefined;
				}
			}]
		});
		calendar.render();
		await waitForPhase(calendar, "ready");

		const formatter = new Intl.NumberFormat(locale, {
			compactDisplay: "short",
			maximumFractionDigits: 1,
			notation: "compact",
			signDisplay: "always",
			useGrouping: false
		});
		const unsignedFormatter = new Intl.NumberFormat(locale, {
			compactDisplay: "short",
			maximumFractionDigits: 1,
			notation: "compact",
			useGrouping: false
		});
		assert.deepEqual([...compactTexts], [
			["2026-07-12", unsignedFormatter.format(2)],
			...[...pairedEventCounts].map(([dateString, eventCount]) => [
				dateString,
				formatter.format(eventCount - 1)
			])
		]);
		if (locale === "en-US") {
			assert.deepEqual([...compactTexts.values()], ["2", "+1", "+999", "+1K", "+1.3K"]);
		}
		calendar.destroy();
	}
});

void test("multi-day occurrences contribute to each day's adaptive overflow count", async (context) => {
	const { host } = setupDom(context);
	const compactCounts = new Map<string, readonly [number, number, number, string]>();
	const calendar = createCalendar(host, {
		events: [
			{ end: "2026-07-17", id: "spanning", start: "2026-07-14", title: "Spanning" },
			event("day-14", "2026-07-14T09:00", "Day 14"),
			event("day-15-a", "2026-07-15T09:00", "Day 15 A"),
			event("day-15-b", "2026-07-15T10:00", "Day 15 B"),
			event("day-16", "2026-07-16T09:00", "Day 16")
		],
		initialDate: "2026-07-14",
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "multi-day-overflow",
			renderEventOverflow: (renderContext) => {
				if (renderContext.variant === "compact") {
					compactCounts.set(renderContext.dateString, [
						renderContext.eventCount,
						renderContext.visibleEventCount,
						renderContext.overflowCount,
						renderContext.text
					]);
				}
				return undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual([...compactCounts], [
		["2026-07-14", [2, 1, 1, "+1"]],
		["2026-07-15", [3, 1, 2, "+2"]],
		["2026-07-16", [2, 1, 1, "+1"]]
	]);
});

void test("removed split overflow hook names are rejected as unknown configuration", (context) => {
	const { host } = setupDom(context);
	for (const removedHook of [
		"renderGridOverflowContent",
		"renderMultipleEventIndicator"
	] as const) {
		assert.throws(
			() => createCalendar(host, {
				events: [],
				renderHooks: [{ id: `removed-${removedHook}`, [removedHook]: () => null }]
			}),
			(error: unknown) => error instanceof LitefoldCalendarError &&
				error.code === "invalid-configuration"
		);
	}
	assert.equal(host.childElementCount, 0);
});

void test("cross-variant quarantine restores default content removed during connection", async (context) => {
	const { dom, host } = setupDom(context);
	class DefaultRemovingOverflowElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			this.parentElement?.querySelector(".lfc-event-overflow-default-content")?.remove();
		}
	}
	dom.window.customElements.define(
		"lfc-default-removing-overflow",
		DefaultRemovingOverflowElement
	);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "restore-default"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onError: (error) => { captured = error; },
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "restore-removed-overflow-default",
			renderEventOverflow: ({ document: ownerDocument, variant }) => {
				if (variant === "wide") {
					throw new Error("private wide failure");
				}
				return ownerDocument.createElement("lfc-default-removing-overflow");
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");

	assert.equal(captured?.hook, "renderEventOverflow");
	assert.equal(captured?.surface, "grid-summary");
	assert.equal(host.querySelector("lfc-default-removing-overflow"), null);
	const compactDefault = host.querySelector<HTMLElement>(
		".lfc-calendar-event-overflow.lfc-is-compact .lfc-event-overflow-default-content"
	);
	assert.ok(compactDefault);
	assert.equal(compactDefault.textContent, "+1");
	assert.equal(
		compactDefault.closest(".lfc-calendar-event-overflow")
			?.classList.contains("lfc-has-custom-event-overflow"),
		false
	);
	assert.doesNotMatch(host.textContent ?? "", /private wide failure/u);
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

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
