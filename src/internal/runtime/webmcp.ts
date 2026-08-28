import { formatCalendarDate, parseCalendarDate } from "../domain/civil-date.js";
import type { NormalizedCalendarEvent } from "../domain/event-normalization.js";
import { isRecord } from "./safety.js";
import type {
	CalendarDate, CalendarEvent, CalendarState, CalendarWebMcpOptions
} from "../../types.js";

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const GET_EVENTS_TOOL_SUFFIX = "-get-events";
const NAVIGATE_TOOL_SUFFIX = "-navigate";
const EVENT_PAGE_SIZE = 10;
const GET_EVENTS_INPUT_SCHEMA = Object.freeze({
	additionalProperties: false,
	properties: Object.freeze({
		date: Object.freeze({
			description: "Optional strict YYYY-MM-DD date filter. Omit it to inspect every event available on allowed dates in the current visible range.",
			pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
			type: "string"
		}),
		offset: Object.freeze({
			description: "Zero-based event offset for paging. Defaults to 0.",
			minimum: 0,
			type: "integer"
		})
	}),
	type: "object"
});

const NAVIGATE_INPUT_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({
			additionalProperties: false,
			properties: Object.freeze({
				date: Object.freeze({
					description: "Destination in strict YYYY-MM-DD form.",
					pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
					type: "string"
				}),
				target: Object.freeze({ const: "date" })
			}),
			required: Object.freeze(["target", "date"]),
			type: "object"
		}),
		Object.freeze({
			additionalProperties: false,
			properties: Object.freeze({
				target: Object.freeze({
					enum: Object.freeze(["today", "previous-month", "next-month"])
				})
			}),
			required: Object.freeze(["target"]),
			type: "object"
		})
	]),
	type: "object"
});

const GET_EVENTS_ANNOTATIONS = Object.freeze({
	readOnlyHint: true,
	untrustedContentHint: true
});

const NAVIGATE_ANNOTATIONS = Object.freeze({
	readOnlyHint: false
});

interface WebMcpExecuteOptions {
	readonly signal: AbortSignal;
}

interface WebMcpRegistrationOptions {
	readonly signal: AbortSignal;
}

interface WebMcpTool {
	readonly annotations: Readonly<Record<string, boolean>>;
	readonly description: string;
	readonly execute: (
		this: void,
		input: object,
		options: Readonly<WebMcpExecuteOptions>
	) => Promise<unknown>;
	readonly inputSchema: Readonly<Record<string, unknown>>;
	readonly name: string;
	readonly title: string;
}

interface WebMcpModelContext {
	registerTool(
		this: WebMcpModelContext,
		tool: Readonly<WebMcpTool>,
		options: Readonly<WebMcpRegistrationOptions>
	): Promise<void>;
}

interface CalendarWebMcpEventData {
	readonly end: CalendarEvent["end"];
	readonly isAllDay: CalendarEvent["isAllDay"];
	readonly start: CalendarEvent["start"];
	readonly title: CalendarEvent["title"];
}

interface CalendarWebMcpEventPage {
	readonly events: readonly Readonly<CalendarWebMcpEventData>[];
	readonly totalEvents: number;
}

/** Caches and pages one calendar's unique events for its current loaded range. */
export class CalendarWebMcpEventPager<TMetadata> {
	private cachedEvents: readonly NormalizedCalendarEvent<TMetadata>[] = [];
	private cachedSnapshot: ReadonlyMap<
		string,
		readonly NormalizedCalendarEvent<TMetadata>[]
	> | null = null;

	public getPage(
		eventsByDate: ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]>,
		date: Readonly<CalendarDate> | null,
		offset: number,
		limit: number,
		isDateAllowed: (this: void, candidate: Readonly<CalendarDate>) => boolean
	): Readonly<CalendarWebMcpEventPage> {
		const entries = date === null
			? this.getVisibleEvents(eventsByDate, isDateAllowed)
			: isDateAllowed(date)
				? eventsByDate.get(formatCalendarDate(date)) ?? []
				: [];
		return Object.freeze({
			events: Object.freeze(entries.slice(offset, offset + limit).map((entry) => entry.event)),
			totalEvents: entries.length
		});
	}

	private getVisibleEvents(
		eventsByDate: ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]>,
		isDateAllowed: (this: void, candidate: Readonly<CalendarDate>) => boolean
	): readonly NormalizedCalendarEvent<TMetadata>[] {
		if (this.cachedSnapshot === eventsByDate) {
			return this.cachedEvents;
		}
		const identifiers = new Set<string>();
		const visibleEvents: NormalizedCalendarEvent<TMetadata>[] = [];
		for (const [dateString, entries] of eventsByDate) {
			const date = parseCalendarDate(dateString);
			if (date === null || !isDateAllowed(date)) {
				continue;
			}
			for (const entry of entries) {
				if (identifiers.has(entry.event.id)) {
					continue;
				}
				identifiers.add(entry.event.id);
				visibleEvents.push(entry);
			}
		}
		this.cachedEvents = Object.freeze(visibleEvents);
		this.cachedSnapshot = eventsByDate;
		return this.cachedEvents;
	}
}

/** A validated WebMCP navigation target used by the calendar coordinator. */
export type CalendarWebMcpNavigationTarget =
	| Readonly<{ readonly date: Readonly<CalendarDate>; readonly target: "date" }>
	| Readonly<{ readonly target: "next-month" | "previous-month" | "today" }>;

/** One synchronously committed calendar navigation and its event-source generation. */
export interface CalendarWebMcpNavigationCommit {
	readonly changed: boolean;
	readonly generation: number;
	readonly navigationRevision: number;
	readonly startedLoad: boolean;
}

/** Tracks calendar-wide navigation ownership without exposing WebMCP types publicly. */
export class CalendarWebMcpNavigationTracker {
	private currentRevision = 0;
	private pendingRevision: number | null = null;

	public get revision(): number { return this.currentRevision; }

	public begin(): number {
		this.pendingRevision = this.currentRevision + 1;
		return this.pendingRevision;
	}

	public cancel(revision: number): void {
		if (this.pendingRevision === revision) { this.pendingRevision = null; }
	}

	public claim(): void {
		this.currentRevision = this.pendingRevision ?? this.currentRevision + 1;
		this.pendingRevision = null;
	}

	public complete(revision: number): void {
		if (this.pendingRevision !== revision) { return; }
		this.pendingRevision = null;
		this.currentRevision = revision;
	}
}

interface CalendarWebMcpControllerOptions {
	readonly abortControllerConstructor: typeof AbortController;
	readonly document: Document;
	readonly getEventPage: (
		this: void,
		date: Readonly<CalendarDate> | null,
		offset: number,
		limit: number
	) => Readonly<CalendarWebMcpEventPage>;
	readonly getGeneration: (this: void) => number;
	readonly getNavigationRevision: (this: void) => number;
	readonly getState: (this: void) => Readonly<CalendarState>;
	readonly hasCurrentSnapshot: (this: void) => boolean;
	readonly isLive: (this: void) => boolean;
	readonly navigate: (
		this: void,
		target: CalendarWebMcpNavigationTarget
	) => Readonly<CalendarWebMcpNavigationCommit>;
	readonly reportRegistrationFailure: (this: void, cause: unknown) => void;
	readonly webMcp: Readonly<CalendarWebMcpOptions>;
}

interface CalendarWebMcpError {
	readonly code:
		| "calendar-unavailable"
		| "date-not-loaded"
		| "date-outside-visible-range"
		| "invalid-input"
		| "navigation-superseded";
	readonly message: string;
}

interface CalendarWebMcpFailure {
	readonly error: Readonly<CalendarWebMcpError>;
	readonly ok: false;
	readonly state: Readonly<CalendarState>;
}

interface CalendarWebMcpNavigationSuccess {
	readonly changed: boolean;
	readonly ok: true;
	readonly state: Readonly<CalendarState>;
}

interface CalendarWebMcpVisibleEvent {
	readonly end: string | null;
	readonly isAllDay: boolean;
	readonly start: string;
	readonly title: string;
}

interface CalendarWebMcpVisibleEventsSuccess {
	readonly dataAvailable: boolean;
	readonly date: string | null;
	readonly events: readonly Readonly<CalendarWebMcpVisibleEvent>[];
	readonly nextOffset: number | null;
	readonly offset: number;
	readonly ok: true;
	readonly state: Readonly<CalendarState>;
	readonly totalEvents: number;
}

interface NavigationWaiter {
	readonly changed: boolean;
	readonly generation: number;
	readonly navigationRevision: number;
	readonly navigationSequence: number;
	readonly onAbort: (this: void) => void;
	readonly reject: (this: void, reason: unknown) => void;
	readonly resolve: (
		this: void,
		result: Readonly<CalendarWebMcpFailure | CalendarWebMcpNavigationSuccess>
	) => void;
	readonly signal: AbortSignal;
}

/** Registers and owns the optional WebMCP surface for one live calendar instance. */
export class CalendarWebMcpController {
	private readonly options: Readonly<CalendarWebMcpControllerOptions>;
	private readonly waiters = new Set<NavigationWaiter>();
	private isDestroyed = false;
	private isRegistrationStarted = false;
	private isStateNotificationPending = false;
	private navigationSequence = 0;
	private registrationController: AbortController | null = null;

	public constructor(options: Readonly<CalendarWebMcpControllerOptions>) {
		this.options = options;
	}

	/** Starts progressive tool registration once the calendar is rendered and live. */
	public register(): void {
		if (this.isDestroyed || this.isRegistrationStarted) {
			return;
		}
		this.isRegistrationStarted = true;

		let modelContext: WebMcpModelContext | null;
		try {
			modelContext = getModelContext(this.options.document);
		} catch (cause: unknown) {
			this.options.reportRegistrationFailure(cause);
			return;
		}
		if (modelContext === null) {
			return;
		}

		const controller = new this.options.abortControllerConstructor();
		this.registrationController = controller;
		void this.registerTools(modelContext, controller).catch((cause: unknown) => {
			if (this.isDestroyed || controller.signal.aborted) {
				return;
			}
			controller.abort();
			this.options.reportRegistrationFailure(cause);
		});
	}

	/** Unregisters tools and settles pending executions during calendar teardown. */
	public destroy(): void {
		if (this.isDestroyed) {
			return;
		}
		this.isDestroyed = true;
		this.registrationController?.abort();
		this.registrationController = null;
		for (const waiter of [...this.waiters]) {
			this.removeWaiter(waiter);
			waiter.reject(createAbortError("The calendar was destroyed."));
		}
	}

	/** Settles navigation executions after the coordinator publishes a new state. */
	public notifyStateChanged(): void {
		if (this.isDestroyed || this.isStateNotificationPending) {
			return;
		}
		this.isStateNotificationPending = true;
		const settle = (): void => {
			this.isStateNotificationPending = false;
			for (const waiter of [...this.waiters]) {
				this.settleWaiter(waiter);
			}
		};
		try {
			queueMicrotask(settle);
		} catch {
			//A broken optional browser hook must not affect the calendar UI.
			settle();
		}
	}

	private async registerTools(
		modelContext: WebMcpModelContext,
		controller: AbortController
	): Promise<void> {
		const registrationOptions = Object.freeze({ signal: controller.signal });
		await modelContext.registerTool(this.createGetEventsTool(), registrationOptions);
		if (controller.signal.aborted) {
			return;
		}
		await modelContext.registerTool(this.createNavigateTool(), registrationOptions);
	}

	private createGetEventsTool(): Readonly<WebMcpTool> {
		return Object.freeze({
			annotations: GET_EVENTS_ANNOTATIONS,
			description: `Read up to ${EVENT_PAGE_SIZE.toString()} unique events from this calendar's currently loaded, allowed visible range. Omit date for the whole range, provide date to filter one day, and continue with nextOffset.`,
			execute: (
				input: object,
				options: Readonly<WebMcpExecuteOptions>
			) => this.executeGetEvents(input, options.signal),
			inputSchema: GET_EVENTS_INPUT_SCHEMA,
			name: `${this.options.webMcp.toolNamePrefix}${GET_EVENTS_TOOL_SUFFIX}`,
			title: "Get calendar events"
		});
	}

	private createNavigateTool(): Readonly<WebMcpTool> {
		return Object.freeze({
			annotations: NAVIGATE_ANNOTATIONS,
			description: "Change this calendar's visible and selected date without activating events or application actions.",
			execute: (
				input: object,
				options: Readonly<WebMcpExecuteOptions>
			) => this.executeNavigate(input, options.signal),
			inputSchema: NAVIGATE_INPUT_SCHEMA,
			name: `${this.options.webMcp.toolNamePrefix}${NAVIGATE_TOOL_SUFFIX}`,
			title: "Navigate calendar"
		});
	}

	private executeGetEvents(input: object, signal: AbortSignal): Promise<unknown> {
		if (isExecutionCanceled(signal)) {
			return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
		}
		const parsedInput = parseGetEventsInput(input);
		if (parsedInput === null) {
			return Promise.resolve(this.createFailure(
				"invalid-input",
				"Input must contain only an optional strict date and non-negative integer offset."
			));
		}
		if (isExecutionCanceled(signal)) {
			return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
		}
		if (!this.options.isLive()) {
			return Promise.resolve(this.createFailure(
				"calendar-unavailable",
				"The calendar is no longer available."
			));
		}

		const state = this.options.getState();
		const date = parsedInput.date;
		const dateString = date === null ? null : formatCalendarDate(date);
		if (state.range === null || (dateString !== null &&
			(dateString < state.range.start || dateString >= state.range.end))) {
			return Promise.resolve(this.createFailure(
				"date-outside-visible-range",
				state.range === null
					? "The calendar does not have a visible range."
					: "The requested date is outside the current visible range; navigate the calendar first."
			));
		}

		const dataAvailable = this.options.hasCurrentSnapshot();
		if (!dataAvailable) {
			return Promise.resolve(this.createFailure(
				state.phase === "unavailable" ? "calendar-unavailable" : "date-not-loaded",
				state.phase === "unavailable"
					? "The calendar has no usable event snapshot."
					: "The current visible range does not have a loaded event snapshot yet."
			));
		}
		const sourcePage = this.options.getEventPage(
			date,
			parsedInput.offset,
			EVENT_PAGE_SIZE
		);
		const page = sourcePage.events.map((event) => Object.freeze({
			end: event.end,
			isAllDay: event.isAllDay,
			start: event.start,
			title: event.title
		}));
		const totalEvents = sourcePage.totalEvents;
		const nextOffset = parsedInput.offset + page.length < totalEvents
			? parsedInput.offset + page.length
			: null;
		const result: CalendarWebMcpVisibleEventsSuccess = Object.freeze({
			dataAvailable,
			date: dateString,
			events: Object.freeze(page),
			nextOffset,
			offset: parsedInput.offset,
			ok: true,
			state,
			totalEvents
		});
		return Promise.resolve(result);
	}

	private executeNavigate(input: object, signal: AbortSignal): Promise<unknown> {
		if (isExecutionCanceled(signal)) {
			return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
		}
		const target = parseNavigateInput(input);
		if (target === null) {
			return Promise.resolve(this.createFailure(
				"invalid-input",
				"Input must select a date, today, the previous month, or the next month."
			));
		}
		if (!this.options.isLive()) {
			return Promise.resolve(this.createFailure(
				"calendar-unavailable",
				"The calendar is no longer available."
			));
		}
		if (signal.aborted) {
			return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
		}

		const previousNavigationSequence = this.navigationSequence;
		const navigationSequence = previousNavigationSequence + 1;
		this.navigationSequence = navigationSequence;
		let commit: Readonly<CalendarWebMcpNavigationCommit>;
		try {
			commit = this.options.navigate(target);
		} catch {
			if (this.navigationSequence === navigationSequence) {
				this.navigationSequence = previousNavigationSequence;
			}
			return Promise.resolve(this.createFailure(
				this.options.isLive() ? "invalid-input" : "calendar-unavailable",
				this.options.isLive()
					? "The requested calendar destination is not available."
					: "The calendar is no longer available."
			));
		}
		for (const waiter of [...this.waiters]) {
			this.settleWaiter(waiter);
		}
		return this.waitForNavigation(commit, navigationSequence, signal);
	}

	private waitForNavigation(
		commit: Readonly<CalendarWebMcpNavigationCommit>,
		navigationSequence: number,
		signal: AbortSignal
	): Promise<Readonly<CalendarWebMcpFailure | CalendarWebMcpNavigationSuccess>> {
		if (signal.aborted) {
			return Promise.reject(createAbortError("The WebMCP tool execution was canceled."));
		}
		if (!commit.startedLoad) {
			if (navigationSequence !== this.navigationSequence ||
				commit.navigationRevision !== this.options.getNavigationRevision()) {
				return Promise.resolve(this.createFailure(
					"navigation-superseded",
					"A newer calendar operation superseded this navigation."
				));
			}
			const state = this.options.getState();
			if (!this.options.isLive() || state.phase === "unavailable") {
				return Promise.resolve(this.createFailure(
					"calendar-unavailable",
					"The calendar is not currently available."
				));
			}
			return Promise.resolve(Object.freeze({
				changed: commit.changed,
				ok: true,
				state
			}));
		}
		return new Promise((resolve, reject) => {
			const onAbort = (): void => {
				this.removeWaiter(waiter);
				reject(createAbortError("The WebMCP tool execution was canceled."));
			};
			const waiter: NavigationWaiter = {
				changed: commit.changed,
				generation: commit.generation,
				navigationRevision: commit.navigationRevision,
				navigationSequence,
				onAbort,
				reject,
				resolve,
				signal
			};
			if (signal.aborted) {
				reject(createAbortError("The WebMCP tool execution was canceled."));
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
			this.waiters.add(waiter);
			this.settleWaiter(waiter);
		});
	}

	private settleWaiter(waiter: NavigationWaiter): void {
		if (!this.waiters.has(waiter)) {
			return;
		}
		let result: Readonly<CalendarWebMcpFailure | CalendarWebMcpNavigationSuccess> | null = null;
		if (this.isDestroyed || !this.options.isLive()) {
			result = this.createFailure("calendar-unavailable", "The calendar is no longer available.");
		} else if (waiter.navigationSequence !== this.navigationSequence ||
			waiter.navigationRevision !== this.options.getNavigationRevision() ||
			this.options.getGeneration() !== waiter.generation) {
			result = this.createFailure(
				"navigation-superseded",
				"A newer calendar operation superseded this navigation."
			);
		} else {
			const state = this.options.getState();
			if (state.phase === "unavailable") {
				result = this.createFailure(
					"calendar-unavailable",
					"The calendar could not load the requested view."
				);
			} else if (state.phase !== "loading") {
				result = Object.freeze({ changed: waiter.changed, ok: true, state });
			}
		}
		if (result !== null) {
			this.removeWaiter(waiter);
			waiter.resolve(result);
		}
	}

	private removeWaiter(waiter: NavigationWaiter): void {
		this.waiters.delete(waiter);
		waiter.signal.removeEventListener("abort", waiter.onAbort);
	}

	private createFailure(
		code: CalendarWebMcpError["code"],
		message: string
	): Readonly<CalendarWebMcpFailure> {
		return Object.freeze({
			error: Object.freeze({ code, message }),
			ok: false,
			state: this.options.getState()
		});
	}
}

interface ParsedGetEventsInput {
	readonly date: Readonly<CalendarDate> | null;
	readonly offset: number;
}

function parseGetEventsInput(input: object): Readonly<ParsedGetEventsInput> | null {
	const keys = getInputKeys(input, new Set(["date", "offset"]));
	if (keys === null) {
		return null;
	}
	let date: Readonly<CalendarDate> | null = null;
	let offset = 0;
	try {
		if (keys.has("date")) {
			const dateValue = Reflect.get(input, "date") as unknown;
			if (typeof dateValue !== "string" || !DATE_INPUT_PATTERN.test(dateValue)) {
				return null;
			}
			date = parseCalendarDate(dateValue);
			if (date === null) {
				return null;
			}
		}
		if (keys.has("offset")) {
			const offsetValue = Reflect.get(input, "offset") as unknown;
			if (typeof offsetValue !== "number" || !Number.isSafeInteger(offsetValue) ||
				offsetValue < 0) {
				return null;
			}
			offset = offsetValue;
		}
	} catch {
		return null;
	}
	return Object.freeze({ date, offset });
}

function parseNavigateInput(input: object): CalendarWebMcpNavigationTarget | null {
	const keys = getInputKeys(input, new Set(["date", "target"]));
	if (keys?.has("target") !== true) {
		return null;
	}
	let target: unknown;
	try {
		target = Reflect.get(input, "target");
	} catch {
		return null;
	}
	if (target === "date") {
		if (keys.size !== 2 || !keys.has("date")) {
			return null;
		}
		let dateValue: unknown;
		try {
			dateValue = Reflect.get(input, "date");
		} catch {
			return null;
		}
		if (typeof dateValue !== "string" || !DATE_INPUT_PATTERN.test(dateValue)) {
			return null;
		}
		const date = parseCalendarDate(dateValue);
		return date === null ? null : Object.freeze({ date, target });
	}
	if (keys.size !== 1 ||
		(target !== "today" && target !== "previous-month" && target !== "next-month")) {
		return null;
	}
	return Object.freeze({ target });
}

function getInputKeys(input: object, allowed: ReadonlySet<string>): ReadonlySet<string> | null {
	if (!isRecord(input)) {
		return null;
	}
	let keys: readonly PropertyKey[];
	try {
		if (Array.isArray(input)) {
			return null;
		}
		keys = Reflect.ownKeys(input);
	} catch {
		return null;
	}
	if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
		return null;
	}
	return new Set(keys as readonly string[]);
}

function getModelContext(document: Document): WebMcpModelContext | null {
	const candidate = Reflect.get(document, "modelContext") as unknown;
	if (candidate === undefined || candidate === null) {
		return null;
	}
	if (!isRecord(candidate) || typeof Reflect.get(candidate, "registerTool") !== "function") {
		return null;
	}
	return candidate as unknown as WebMcpModelContext;
}

function createAbortError(message: string): DOMException {
	return new DOMException(message, "AbortError");
}

function isExecutionCanceled(signal: AbortSignal): boolean {
	return signal.aborted;
}
