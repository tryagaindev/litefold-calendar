import type {
	CalendarErrorDisposition,
	CalendarIssue,
	CalendarRangeBounds,
	LitefoldCalendarError,
	CalendarSurface
} from "./errors.js";
import type { CalendarIcons } from "./icons.js";
import type { CalendarMessages } from "./messages.js";

/** A Gregorian civil date with a one-based month. */
export interface CalendarDate {
	/** Day of the month, from `1` through the month's final day. */
	readonly day: number;
	/** Gregorian month number, from `1` (January) through `12` (December). */
	readonly month: number;
	/** Gregorian year, from `1` through `9999`. */
	readonly year: number;
}

/** A validated civil date, strict civil string, or `Date` instant accepted by calendar date APIs. */
export type CalendarDateInput = Date | string | Readonly<CalendarDate>;

/** The source shape accepted from a calendar event provider. */
export interface CalendarEventInput<TMetadata = unknown> {
	/** Optional six-digit `#RRGGBB` built-in marker color; invalid values normalize to no explicit accent. */
	readonly accentColor?: string;
	/** Optional exclusive end that follows `start` and uses the same date-only or date-time form. */
	readonly end?: string;
	/** Non-empty identifier unique within one returned source snapshot. */
	readonly id: string;
	/** Opaque application data preserved by reference for actions and extensions. */
	readonly metadata?: TMetadata;
	/** Strict Gregorian civil date or local date-time string used to place the event. */
	readonly start: string;
	/** User-visible event title; surrounding whitespace is removed during normalization. */
	readonly title: string;
	/** Optional relative or HTTP(S) destination resolved against the host document. */
	readonly url?: string;
}

/** The immutable event shape exposed to application callbacks and extensions. */
export interface CalendarEvent<TMetadata = unknown> {
	/** An exact normalized `#RRGGBB` value, or `null` to use the CSS token fallback. */
	readonly accentColor: string | null;
	/** The explicit exclusive end supplied by the source, or `null` when the default duration applies. */
	readonly end: string | null;
	/** Source identifier preserved without rewriting. */
	readonly id: string;
	/** Whether `start` and any explicit `end` are date-only values. */
	readonly isAllDay: boolean;
	/** Opaque application metadata preserved by reference. */
	readonly metadata: TMetadata | undefined;
	/** Validated strict Gregorian civil start value preserved from the source. */
	readonly start: string;
	/** Trimmed user-visible event title. */
	readonly title: string;
	/** Validated relative or absolute HTTP(S) destination, or `null` when the event has no link. */
	readonly url: string | null;
}

/** The inclusive start and exclusive end of one abort-aware event request. */
export interface CalendarRange extends CalendarRangeBounds {
	/** Aborts when this request is superseded or the calendar is destroyed. */
	readonly signal: AbortSignal;
}

/**
 * An abort-aware provider for the one current fixed 42-day grid.
 * Called for initial load, each committed month change, and each explicit refetch;
 * pager pulls never request an adjacent range before commit.
 */
export type CalendarEventSource<TMetadata = unknown> = (
	this: void,
	range: Readonly<CalendarRange>
) => readonly CalendarEventInput<TMetadata>[] |
	PromiseLike<readonly CalendarEventInput<TMetadata>[]>;

/** Static events or an abort-aware `CalendarEventSource`. */
export type CalendarEvents<TMetadata = unknown> =
	readonly CalendarEventInput<TMetadata>[] | CalendarEventSource<TMetadata>;

/** The component lifecycle phase exposed through calendar state. */
export type CalendarPhase = "idle" | "loading" | "ready" | "degraded" | "unavailable" | "destroyed";

/** An immutable, safe snapshot of observable calendar state. */
export interface CalendarState {
	/** First day of the month currently displayed by the grid. */
	readonly displayedMonth: Readonly<CalendarDate>;
	/** Presentation-safe failures affecting the current calendar instance. */
	readonly issues: readonly Readonly<CalendarIssue>[];
	/** Current lifecycle and data-availability state. */
	readonly phase: CalendarPhase;
	/** Inclusive/exclusive bounds represented by the single current 42-day grid, or `null` before render and after destroy. */
	readonly range: Readonly<CalendarRangeBounds> | null;
	/** Date currently selected for the agenda. */
	readonly selectedDate: Readonly<CalendarDate>;
}

/** A request to announce calendar state through an application-owned live region. */
export interface CalendarAnnouncement {
	/** Localized user-safe text to announce. */
	readonly message: string;
	/** ARIA live-region urgency requested by the calendar. */
	readonly politeness: "polite" | "assertive";
}

/** Common values supplied to every extension render and mount hook. */
export interface CalendarExtensionContext<
	TSurface extends CalendarSurface = CalendarSurface
> {
	/** The calendar host's document; use it to create extension nodes. */
	readonly document: Document;
	/** Aborts before extension cleanup when the extension is replaced, quarantined, or destroyed. */
	readonly signal: AbortSignal;
	/** Rendered location receiving this hook call. */
	readonly surface: TSurface;
}

/** Values supplied to extensions that decorate a rendered day. */
export interface CalendarDayExtensionContext extends CalendarExtensionContext<"day"> {
	/** Structured Gregorian date for the rendered day. */
	readonly date: CalendarDate;
	/** Strict `YYYY-MM-DD` form of `date`. */
	readonly dateString: string;
	/** Stable owned elements for supported day customization. */
	readonly elements: CalendarDayElements;
	/** Whether the day belongs to the displayed month rather than a grid-filler month. */
	readonly isCurrentMonth: boolean;
	/** Whether the day owns the visible agenda. */
	readonly isSelected: boolean;
	/** Whether the day matches the configured clock. */
	readonly isToday: boolean;
}

/** Stable element references supplied to day extensions without exposing private selectors. */
export interface CalendarDayElements {
	/** Visual-only extension slot for a day badge. */
	readonly badge: HTMLElement;
	/** Native day-selection button. */
	readonly button: HTMLButtonElement;
	/** ARIA gridcell containing the day button. */
	readonly cell: HTMLElement;
	/** Native time element containing the localized day number and civil date. */
	readonly number: HTMLTimeElement;
	/** Container for this day’s static summaries and native event or overflow actions. */
	readonly summaries: HTMLElement;
}

/** A native event action rendered as navigation or an application-owned action. */
export type CalendarEventActionElement = HTMLAnchorElement | HTMLButtonElement;

/** A calendar surface on which one event occurrence can be activated. */
export type CalendarEventSurface = "grid-summary" | "agenda";

/** Calendar surfaces on which event times remain visually displayed. */
export type CalendarEventTimeDisplay = "all" | "grid" | "agenda" | "none";

/** Stable element references supplied to event extensions without exposing private selectors. */
export interface CalendarEventElements {
	/** Native link or button for an actionable occurrence, or `null` for a static representation. */
	readonly action: CalendarEventActionElement | null;
	/** Extension slot after the built-in title. */
	readonly details: HTMLElement;
	/** Extension slot before the built-in time and title. */
	readonly leading: HTMLElement;
	/** Container for the built-in or extension-provided event marker. */
	readonly marker: HTMLElement;
	/** Root event element for this rendering surface. */
	readonly root: HTMLElement;
	/** Native time element containing the localized event time. */
	readonly time: HTMLTimeElement;
	/** Element containing the event title. */
	readonly title: HTMLElement;
	/** Extension slot after all other event content. */
	readonly trailing: HTMLElement;
}

/** Values supplied to extensions that decorate a rendered event. */
export interface CalendarEventExtensionContext<TMetadata = unknown>
	extends CalendarExtensionContext<CalendarEventSurface> {
	/** Day on which this event representation is rendered. */
	readonly date: CalendarDate;
	/** Strict `YYYY-MM-DD` form of `date`. */
	readonly dateString: string;
	/** Stable owned elements for supported event customization. */
	readonly elements: CalendarEventElements;
	/** Immutable normalized event. */
	readonly event: CalendarEvent<TMetadata>;
	/** Localized time label, or an empty string when no time is displayed. */
	readonly timeText: string;
}

/** Cleanup returned by an extension mount hook. */
export type CalendarExtensionCleanup = (this: void) => void;

/** A same-realm rendering extension isolated from other extensions on failure. */
export interface CalendarExtension<TMetadata = unknown> {
	/** Stable identifier unique within one calendar instance. */
	readonly id: string;
	/** Observes a rendered day and may return synchronous cleanup. */
	readonly dayDidMount?: (
		this: void,
		context: Readonly<CalendarDayExtensionContext>
	) => void | CalendarExtensionCleanup;
	/** Observes a rendered event and may return synchronous cleanup. */
	readonly eventDidMount?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => void | CalendarExtensionCleanup;
	/** Returns detached, noninteractive content for a day's visual badge slot. */
	readonly renderDayBadge?: (
		this: void,
		context: Readonly<CalendarDayExtensionContext>
	) => Node | null | undefined;
	/** Returns detached, noninteractive content after an event title. */
	readonly renderEventDetails?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null | undefined;
	/** Returns detached, noninteractive content before an event time and title. */
	readonly renderEventLeading?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null | undefined;
	/** Replaces the built-in marker with detached content, or suppresses it with `null`. */
	readonly renderEventMarker?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null;
	/** Returns detached, noninteractive content after all other event content. */
	readonly renderEventTrailing?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null | undefined;
}

/** Information supplied when a user activates an event occurrence. */
export interface CalendarEventActivation<TMetadata = unknown> {
	/** Structured occurrence date represented by the activated event. */
	readonly date: CalendarDate;
	/** Strict `YYYY-MM-DD` form of `date`. */
	readonly dateString: string;
	/** Native link or button that was activated. */
	readonly element: CalendarEventActionElement;
	/** Immutable normalized event. */
	readonly event: CalendarEvent<TMetadata>;
	/** Native click event that caused activation. */
	readonly nativeEvent: MouseEvent;
	/** Rendering surface on which this occurrence was activated. */
	readonly surface: CalendarEventSurface;
}

/** Information supplied for an application context action on an event occurrence. */
export interface CalendarEventContextMenu<TMetadata = unknown>
	extends Omit<CalendarEventActivation<TMetadata>, "nativeEvent"> {
	/** Viewport-relative horizontal coordinate; keyboard-synthesized primary clicks may report zero. */
	readonly clientX: number;
	/** Viewport-relative vertical coordinate; keyboard-synthesized primary clicks may report zero. */
	readonly clientY: number;
	/** Native context gesture, or click from primary activation of a context-only event button. */
	readonly nativeEvent: MouseEvent | KeyboardEvent;
}

/** Values supplied when determining whether an occurrence has an application context action. */
export interface CalendarEventContextMenuAvailability<TMetadata = unknown> {
	/** Structured occurrence date represented by the event. */
	readonly date: CalendarDate;
	/** Strict `YYYY-MM-DD` form of `date`. */
	readonly dateString: string;
	/** Immutable normalized event. */
	readonly event: CalendarEvent<TMetadata>;
	/** Rendering surface for which availability is being resolved. */
	readonly surface: CalendarEventSurface;
}

/** Information supplied when a user selects a calendar day. */
export interface CalendarDaySelection {
	/** Structured Gregorian date selected by the user. */
	readonly date: CalendarDate;
	/** Strict `YYYY-MM-DD` form of `date`. */
	readonly dateString: string;
	/** New live day button after selection rerenders the grid; `nativeEvent` originated on the replaced button. */
	readonly element: HTMLButtonElement;
	/** Native click event, including a browser-synthesized keyboard activation, that caused selection. */
	readonly nativeEvent: MouseEvent;
}

/** Information supplied for a pointer or keyboard context gesture on a calendar day. */
export interface CalendarDayContextMenu extends Omit<CalendarDaySelection, "nativeEvent"> {
	/** Viewport-relative horizontal coordinate for a context surface. */
	readonly clientX: number;
	/** Viewport-relative vertical coordinate for a context surface. */
	readonly clientY: number;
	/** Native context-menu or keyboard event that caused the action. */
	readonly nativeEvent: MouseEvent | KeyboardEvent;
}

/** A synchronous or asynchronous application action. */
export type CalendarAction<TContext> = (
	this: void,
	context: Readonly<TContext>
) => void | PromiseLike<void>;

/** Locale-derived or explicit Sunday-through-Saturday week start. */
export type CalendarFirstDay = "locale" | 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Valid native heading levels for the generated calendar heading. */
export type CalendarHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Immutable options for a reusable month calendar. */
export interface CalendarOptions<TMetadata = unknown> {
	/** Maximum agenda events retained in the DOM; defaults to `200`. */
	readonly agendaDomLimit?: number;
	/** Agenda events revealed per page; defaults to `50`. */
	readonly agendaPageSize?: number;
	/** Surfaces on which event times remain visually displayed; defaults to `"all"`. */
	readonly eventTimeDisplay?: CalendarEventTimeDisplay;
	/** Synchronous bridge to an application-owned live announcer. */
	readonly onAnnounce?: (this: void, announcement: Readonly<CalendarAnnouncement>) => void;
	/** Handles pointer or keyboard context gestures on a day. */
	readonly onDayContextMenu?: CalendarAction<CalendarDayContextMenu>;
	/** Observes a committed user selection; presentation-only feedback never delays the callback. */
	readonly onDaySelect?: CalendarAction<CalendarDaySelection>;
	/** Handles activation of a native event link or button on either rendering surface. */
	readonly onEventActivate?: CalendarAction<CalendarEventActivation<TMetadata>>;
	/** Handles context gestures and primary activation when context is an unlinked occurrence's only action. */
	readonly onEventContextMenu?: CalendarAction<CalendarEventContextMenu<TMetadata>>;
	/** Static events or an abort-aware provider for the one current fixed 42-day grid. */
	readonly events: CalendarEvents<TMetadata>;
	/** Ordered, isolated node-based rendering extensions. */
	readonly extensions?: readonly Readonly<CalendarExtension<TMetadata>>[];
	/** Same-document fallback content outside the host, shown until a usable event snapshot is available. */
	readonly fallbackElement?: HTMLElement;
	/** Locale-derived or explicit week start; defaults to `"locale"`. */
	readonly firstDay?: CalendarFirstDay;
	/** Month-title heading level; agenda and status headings use the next level, capped at `6`. Defaults to `2`. */
	readonly headingLevel?: CalendarHeadingLevel;
	/** Partial navigation-icon factories resolved over built-in text icons. */
	readonly icons?: Readonly<Partial<CalendarIcons>>;
	/** Initially displayed and selected date; defaults to the date produced by `now`. */
	readonly initialDate?: CalendarDateInput;
	/** Synchronously determines whether one rendered occurrence exposes the configured event context action. */
	readonly isEventContextMenuAvailable?: (
		this: void,
		context: Readonly<CalendarEventContextMenuAvailability<TMetadata>>
	) => boolean;
	/** BCP 47 locale used for labels and week conventions; defaults to the browser locale. */
	readonly locale?: string;
	/** Latest selectable date, inclusive; `Date` values use the configured time-zone projection. */
	readonly maxDate?: CalendarDateInput;
	/** Maximum event representations per day cell before the native overflow action; defaults to `3`. */
	readonly maxGridEventsPerDay?: number;
	/** Partial localized messages resolved over immutable English defaults. */
	readonly messages?: Readonly<Partial<CalendarMessages>>;
	/** Earliest selectable date, inclusive; `Date` values use the configured time-zone projection. */
	readonly minDate?: CalendarDateInput;
	/** Supplies the instant used during construction, every grid render, and Today navigation; defaults to `new Date()`. */
	readonly now?: (this: void) => Date;
	/** Observes typed errors and may synchronously transfer presentation ownership with `"handled"`. */
	readonly onError?: (
		this: void,
		error: LitefoldCalendarError
	) => void | CalendarErrorDisposition;
	/** Synchronously observes immutable, presentation-safe state snapshots. */
	readonly onStateChange?: (this: void, state: Readonly<CalendarState>) => void;
	/** Maximum events accepted from one source result; defaults to `10,000`. */
	readonly sourceEventLimit?: number;
	/**
	 * Enables an RTL-aware native pull/snap route for touch, pen, and horizontal
	 * precision scrolling. Input mapping and physics remain browser/OS behavior;
	 * each settle commits at most one month. Defaults to `true`.
	 */
	readonly swipe?: boolean;
	/** IANA zone used only when projecting `Date` instants; strict event strings remain civil values. */
	readonly timeZone?: string;
	/** Detached or host-descendant same-document application HTML element placed after built-in toolbar controls. */
	readonly toolbarEnd?: HTMLElement;
}

/** The intentionally small calendar lifecycle, state, and navigation API. */
export interface Calendar {
	/** Adds the calendar to its host and starts loading the visible month; throws when the instance cannot claim the host. */
	render(): void;
	/** Aborts pending work, removes listeners, and clears the host. */
	destroy(): void;
	/** Forces the current visible range to be loaded again; throws unless the instance is rendered and live. */
	refetchEvents(): void;
	/** Displays and selects a supported date without moving focus; throws for an invalid argument or lifecycle state. */
	gotoDate(date: CalendarDateInput): void;
	/** Selects and focuses a supported date; throws for an invalid argument or lifecycle state. */
	focusDate(date: CalendarDateInput): void;
	/** Selects and focuses the configured current date when its month is renderable; throws unless the instance is rendered and live. */
	focusToday(): void;
	/** Moves to the previous month when one is renderable; throws unless the instance is rendered and live. */
	prev(): void;
	/** Moves to the next month when one is renderable; throws unless the instance is rendered and live. */
	next(): void;
	/** Displays the configured current date when its month is renderable; throws unless the instance is rendered and live. */
	today(): void;
	/** Returns the latest immutable, presentation-safe state snapshot. */
	getState(): Readonly<CalendarState>;
}
