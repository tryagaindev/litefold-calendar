import type {
	Calendar,
	CalendarOptions,
	CalendarRenderCleanup,
	CalendarRenderHooks
} from "../src/index.js";

/* eslint-disable @typescript-eslint/unbound-method -- Compile-only assertions intentionally detach methods. */

interface BaseMetadata {
	readonly id: string;
}

interface DetailedMetadata extends BaseMetadata {
	readonly detail: string;
}

/** Compile-only assertions for public callback and instance contracts. */
export function verifyPublicApiTypeContracts(): void {
	let observations = 0;
	const cleanup: CalendarRenderCleanup = () => { observations += 1; };
	const hooks: CalendarRenderHooks = {
		dayDidMount: () => cleanup,
		eventDidMount: () => undefined,
		id: "synchronous"
	};
	const options: CalendarOptions = {
		events: [],
		onAnnounce: () => { observations += 1; },
		onError: () => "default",
		onStateChange: () => { observations += 1; },
		renderHooks: [hooks]
	};
	void observations;
	void options;

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

	const baseCalendar = null as unknown as Calendar<BaseMetadata>;
	const detailedCalendar = null as unknown as Calendar<DetailedMetadata>;
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
