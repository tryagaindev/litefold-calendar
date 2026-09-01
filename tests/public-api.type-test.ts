import type {
	Calendar,
	CalendarCompactEventOverflowContext,
	CalendarEventOverflowElements,
	CalendarGridEventPlacement,
	CalendarOptions,
	CalendarRenderCleanup,
	CalendarRenderHooks,
	CalendarWeekRowSizing,
	CalendarWideEventOverflowContext
} from "../src/index.js";

/* eslint-disable @typescript-eslint/unbound-method -- Compile-only assertions intentionally detach methods. */

interface BaseMetadata {
	readonly id: string;
}

interface DetailedMetadata extends BaseMetadata {
	readonly detail: string;
}

/** Compile-only assertions for public callback and instance contracts. */
export function verifyPublicApiTypeContracts(
	baseCalendar: Calendar<BaseMetadata>,
	detailedCalendar: Calendar<DetailedMetadata>
): void {
	let observations = 0;
	const cleanup: CalendarRenderCleanup = () => { observations += 1; };
	const hooks: CalendarRenderHooks = {
		dayDidMount: () => cleanup,
		eventDidMount: () => undefined,
		id: "synchronous",
		renderEventOverflow: (context) => {
			if (context.variant === "compact") {
				const compactContext: Readonly<CalendarCompactEventOverflowContext> = context;
				const compactElements: Readonly<CalendarEventOverflowElements> =
					context.elements;
				const compactSurface: "day" = context.surface;
				void compactContext;
				void compactElements;
				void compactSurface;
			} else {
				const wideContext: Readonly<CalendarWideEventOverflowContext> = context;
				const wideAction: HTMLButtonElement = context.elements.action;
				const wideSurface: "grid-summary" = context.surface;
				void wideAction;
				void wideContext;
				void wideSurface;
			}
			return context.document.createTextNode(context.text);
		}
	};
	const options: CalendarOptions = {
		events: [],
		gridEventPlacement: "top",
		onAnnounce: () => { observations += 1; },
		onError: () => "default",
		onStateChange: () => { observations += 1; },
		renderHooks: [hooks],
		weekRowSizing: "equal"
	};
	const gridEventPlacements: readonly CalendarGridEventPlacement[] = [
		"top",
		"center",
		"bottom"
	];
	const weekRowSizings: readonly CalendarWeekRowSizing[] = ["equal", "content"];
	void observations;
	void options;
	void gridEventPlacements;
	void weekRowSizings;

	const invalidGridEventPlacement: CalendarOptions = {
		events: [],
		// @ts-expect-error gridEventPlacement accepts only the documented placement values.
		gridEventPlacement: "stretch"
	};
	const invalidWeekRowSizing: CalendarOptions = {
		events: [],
		// @ts-expect-error weekRowSizing accepts only equal or content sizing.
		weekRowSizing: "fixed"
	};
	void invalidGridEventPlacement;
	void invalidWeekRowSizing;

	// @ts-expect-error Cleanup must not return a thenable.
	const asyncCleanup: CalendarRenderCleanup = () => Promise.resolve();
	// @ts-expect-error Cleanup must return exactly undefined.
	const valueCleanup: CalendarRenderCleanup = () => 1;
	void asyncCleanup;
	void valueCleanup;

	const asyncHostCallback = () => Promise.resolve();
	const invalidAnnouncer: CalendarOptions = {
		events: [],
		// @ts-expect-error onAnnounce is a synchronous integration point.
		onAnnounce: asyncHostCallback
	};
	const invalidErrorHandler: CalendarOptions = {
		events: [],
		// @ts-expect-error onError cannot transfer presentation ownership asynchronously.
		onError: () => Promise.resolve("handled" as const)
	};
	const invalidStateObserver: CalendarOptions = {
		events: [],
		// @ts-expect-error onStateChange is a synchronous integration point.
		onStateChange: asyncHostCallback
	};
	const invalidMountHook: CalendarRenderHooks = {
		// @ts-expect-error Mount hooks may return only synchronous cleanup.
		dayDidMount: asyncHostCallback,
		id: "asynchronous"
	};
	void invalidAnnouncer;
	void invalidErrorHandler;
	void invalidStateObserver;
	void invalidMountHook;

	const removedMultipleEventIndicator: CalendarRenderHooks = {
		id: "removed-multiple-event-indicator",
		//@ts-expect-error The 0.4 overflow API replaces renderMultipleEventIndicator.
		renderMultipleEventIndicator: () => null
	};
	const removedGridOverflowContent: CalendarRenderHooks = {
		id: "removed-grid-overflow-content",
		//@ts-expect-error The 0.4 overflow API replaces renderGridOverflowContent.
		renderGridOverflowContent: () => null
	};
	void removedGridOverflowContent;
	void removedMultipleEventIndicator;

	// @ts-expect-error Calendar metadata is invariant; widening would make setEvents unsafe.
	const widenedCalendar: Calendar<BaseMetadata> = detailedCalendar;
	// @ts-expect-error Calendar metadata is invariant; narrowing would overstate accepted input.
	const narrowedCalendar: Calendar<DetailedMetadata> = baseCalendar;
	void widenedCalendar;
	void narrowedCalendar;

	baseCalendar.render();
	const render = baseCalendar.render;
	// @ts-expect-error Instance methods require their calendar receiver.
	render();
	const setEvents = baseCalendar.setEvents;
	// @ts-expect-error Event replacement also requires its calendar receiver.
	setEvents([]);
	render.call(baseCalendar);
	setEvents.call(baseCalendar, []);
}
