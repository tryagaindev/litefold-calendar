import type {
	Calendar,
	CalendarCompactEventOverflowContext,
	CalendarEventOverflowElements,
	CalendarEventOverflowActivation,
	CalendarGridEventDisplay,
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

function consumeTypeAssertions(...values: readonly unknown[]): readonly unknown[] {
	return values;
}

/** Count options preserve metadata inference and immutable activation snapshots. */
export function verifyCountApiTypeContracts(): void {
	const modes: readonly CalendarGridEventDisplay[] = ["events", "count", "count-when-multiple"];
	const options: CalendarOptions<DetailedMetadata> = {
		events: [],
		gridEventDisplay: { compact: "count", wide: "count-when-multiple" },
		onEventOverflowActivate: (context) => {
			const activation: CalendarEventOverflowActivation<DetailedMetadata> = context;
			const detail: string | undefined = context.events[0]?.metadata?.detail;
			context.nativeEvent.preventDefault();
			//@ts-expect-error The loaded occurrence snapshot cannot be extended by applications.
			context.events.length = 0;
			//@ts-expect-error Applications cannot change the authoritative count.
			context.eventCount = 0;
			consumeTypeAssertions(activation, detail);
			return Promise.resolve();
		}
	};
	const invalid: CalendarOptions = {
		events: [],
		//@ts-expect-error Only documented count and event presentation modes are supported.
		gridEventDisplay: { compact: "auto" }
	};
	consumeTypeAssertions(modes, options, invalid);
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
				consumeTypeAssertions(compactContext, compactElements, compactSurface);
			} else {
				const wideContext: Readonly<CalendarWideEventOverflowContext> = context;
				const wideAction: HTMLButtonElement = context.elements.action;
				const wideSurface: "grid-summary" = context.surface;
				consumeTypeAssertions(wideAction, wideContext, wideSurface);
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
	consumeTypeAssertions(observations, options, gridEventPlacements, weekRowSizings);

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
	consumeTypeAssertions(invalidGridEventPlacement, invalidWeekRowSizing);

	// @ts-expect-error Cleanup must not return a thenable.
	const asyncCleanup: CalendarRenderCleanup = () => Promise.resolve();
	// @ts-expect-error Cleanup must return exactly undefined.
	const valueCleanup: CalendarRenderCleanup = () => 1;
	consumeTypeAssertions(asyncCleanup, valueCleanup);

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
	consumeTypeAssertions(invalidAnnouncer, invalidErrorHandler, invalidStateObserver, invalidMountHook);

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
	consumeTypeAssertions(removedGridOverflowContent, removedMultipleEventIndicator);

	// @ts-expect-error Calendar metadata is invariant; widening would make setEvents unsafe.
	const widenedCalendar: Calendar<BaseMetadata> = detailedCalendar;
	// @ts-expect-error Calendar metadata is invariant; narrowing would overstate accepted input.
	const narrowedCalendar: Calendar<DetailedMetadata> = baseCalendar;
	consumeTypeAssertions(widenedCalendar, narrowedCalendar);

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
