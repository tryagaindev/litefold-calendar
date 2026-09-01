import {
	addCalendarDays, addCalendarMonths, compareCalendarDates, formatCalendarDate,
	getCalendarDateForTimeZone, parseCalendarDate, positiveModulo, toUtcDate
} from "../domain/civil-date.js";
import {
	indexCalendarEventsByDate,
	type NormalizedCalendarEvent
} from "../domain/event-normalization.js";
import { getCalendarMonthRange, isRenderableMonth } from "../domain/grid.js";
import { CalendarBounds } from "../domain/bounds.js";
import {
	isAbortError,
	type LitefoldCalendarError,
	reportCalendarError,
	toCalendarIssue,
	type CalendarRangeBounds
} from "../../errors.js";
import {
	createConfigurationError, getFallbackOption, normalizeIntegerOption, normalizeLocale, normalizeTimeZone,
	resolveFallbackElement, resolveFirstDay, resolveIconNodes, resolveToolbarEnd, snapshotCalendarOptions
} from "./configuration.js";
import {
	createDayContextMenu, createDaySelection, createEventActivation, createEventContextMenu,
	createEventContextMenuAvailability
} from "./actions.js";
import { createRenderHookRuntimes, type RenderHookRuntime } from "./render-hooks.js";
import { requestCalendarEvents, resolveCalendarEvents } from "./source.js";
import {
	createInternalError, createPublicMethodError as createStatePublicMethodError, createState,
	isRenderHookSurface, isSourceIssue, severityRank,
	type InternalIssue
} from "./state.js";
import { CalendarAnnouncementPresenter } from "../dom/announcement.js";
import { presentCalendarIssue } from "../dom/issue-region.js";
import { createCalendarStructure, type CalendarDom } from "../dom/structure.js";
import { CalendarMonthPickerController } from "../dom/month-picker.js";
import { CalendarMonthTitleRenderer } from "../dom/month-title.js";
import { createAgendaPresentation, type AgendaEventEntry } from "../dom/agenda.js";
import { installEventActionListeners as installNativeEventActionListeners } from "../dom/event-structure.js";
import {
	createEventRepresentation as createEventDomRepresentation,
	type EventRepresentation
} from "../dom/event-representation.js";
import { CalendarEventText } from "../dom/event-text.js";
import { createEventAccent } from "../dom/event-accent.js";
import { resolveTextDirection, type HostWindow } from "../dom/environment.js";
import {
	captureCalendarFocus, enterGridActions, getEventActionKey, handleGridActionKeydown,
	getOwnedActiveElement, restoreCalendarFocus, wasOwnedFocusRemoved, type GridFocusElements
} from "../dom/grid-focus.js";
import { createDayCellElements, renderMonthWeeks, renderWeekdayHeadings } from "../dom/month-grid.js";
import {
	DayGridActionCollector,
	installGridOverflowActionListeners
} from "./day-grid-actions.js";
import { resolveCalendarIcons } from "./icon-configuration.js";
import { IntegrationNodeController } from "./integration-nodes.js";
import {
	createEventSourceErrorOptions,
	observeVisibleEventRequest,
	setVisibleEventBusyState,
	type VisibleEventRequest
} from "./event-source-lifecycle.js";
import { CalendarEventOverflowPresenter } from "./event-overflow-presentation.js";
import { releaseLeasedNodes } from "./node-leases.js";
import { SwipeGestureController } from "./swipe.js";
import type { RegisteredExtensionNavigationTarget } from "./registered-extension-contract.js";
import {
	createRegisteredExtensionHost,
	type RegisteredExtensionHost
} from "./registered-extension-host.js";
import { formatCalendarMessage, type CalendarMessages } from "../../messages.js";
import { resolveCalendarMessages } from "./message-configuration.js";
import { RenderHookVisualRenderer } from "./render-hook-visuals.js";
import {
	assertRenderHookElementIntegrity,
	captureRenderHookElementIntegrity,
	getEventRenderHookProtectedElements
} from "./render-hook-element-integrity.js";
import { RenderHookNodeRenderer } from "./render-hook-nodes.js";
import { createEventMountContext } from "./render-hook-context.js";
import {
	invokeForUnknownResult, isDateInstance, isHTMLElementLike, observeThenable
} from "./safety.js";
import type {
	Calendar, CalendarAnnouncement, CalendarDate, CalendarDateInput, CalendarEvent,
	CalendarEventActionElement, CalendarEvents, CalendarEventSurface, CalendarExtension, CalendarOptions,
	CalendarPhase, CalendarState
} from "../../types.js";

const AGENDA_DOM_LIMIT_DEFAULT = 200;
const AGENDA_DOM_LIMIT_MAXIMUM = 500;
const AGENDA_DOM_LIMIT_MINIMUM = 50;
const AGENDA_PAGE_SIZE_DEFAULT = 50;
const AGENDA_PAGE_SIZE_MAXIMUM = 100;
const AGENDA_PAGE_SIZE_MINIMUM = 10;
const DAYS_PER_WEEK = 7;
const GRID_EVENT_LIMIT_DEFAULT = 3;
const GRID_EVENT_LIMIT_MAXIMUM = 10;
const GRID_EVENT_LIMIT_MINIMUM = 0;
const ISSUE_LIMIT = 12;
const ROOT_CLASS = "litefold-calendar";
const SOURCE_EVENT_LIMIT_DEFAULT = 10_000;
const SOURCE_EVENT_LIMIT_MAXIMUM = 10_000;
const SOURCE_EVENT_LIMIT_MINIMUM = 1;

let instanceSequence = 0;

const HOST_OWNERS = new WeakMap<HTMLElement, object>();

interface DayMountRegistration {
	readonly context: Readonly<Record<string, unknown>>;
}

interface EventMountRegistration<TMetadata> {
	readonly context: Readonly<Record<string, unknown>> & {
		readonly event: CalendarEvent<TMetadata>;
	};
}

/**
 * A dependency-free, agenda-first month calendar.
 *
 * Generated CSS classes and data attributes other than the documented root
 * selector and tokens are private implementation details.
 */
export class MonthCalendar<TMetadata = unknown> implements Calendar<TMetadata> {
	private readonly abortControllerConstructor: typeof AbortController;
	private readonly agendaDomLimit: number;
	private readonly agendaPageSize: number;
	private readonly bounds: CalendarBounds;
	private readonly dayFormatter: Intl.DateTimeFormat;
	private readonly document: Document;
	private readonly eventBaseUrl: string;
	private readonly eventOverflowPresenter: CalendarEventOverflowPresenter;
	private readonly eventText: CalendarEventText;
	private eventSource: CalendarEvents<TMetadata>;
	private readonly renderHooks: readonly RenderHookRuntime<TMetadata>[];
	private readonly renderHookNodes: RenderHookNodeRenderer<TMetadata>;
	private readonly renderHookVisuals: RenderHookVisualRenderer<TMetadata>;
	private readonly fallbackElement: HTMLElement | null;
	private readonly firstDay: number;
	private readonly fullDateFormatter: Intl.DateTimeFormat;
	private readonly gridEventLimit: number;
	private readonly headingLevel: number;
	private readonly host: HTMLElement;
	private readonly iconNodes: Readonly<Record<"next" | "previous", Node>>;
	private readonly integrationNodes: IntegrationNodeController;
	private readonly instanceName: string;
	private readonly messages: Readonly<CalendarMessages>;
	private readonly minDate: Readonly<CalendarDate> | undefined;
	private readonly maxDate: Readonly<CalendarDate> | undefined;
	private readonly monthNameFormatter: Intl.DateTimeFormat;
	private readonly monthPickerController: CalendarMonthPickerController;
	private readonly monthTitleRenderer: CalendarMonthTitleRenderer;
	private readonly now: () => Date;
	private readonly numberFormatter: Intl.NumberFormat;
	private readonly options: ReturnType<typeof snapshotCalendarOptions<TMetadata>>;
	private readonly registeredExtensions: RegisteredExtensionHost<TMetadata> | null;
	private readonly sourceEventLimit: number;
	private readonly swipeEnabled: boolean;
	private readonly swipeGesture: SwipeGestureController;
	private readonly timeZone: string | null;
	private readonly toolbarEnd: HTMLElement | null;
	private readonly weekdayFormatter: Intl.DateTimeFormat;
	private readonly weekdayNarrowFormatter: Intl.DateTimeFormat;
	private readonly window: HostWindow | null;

	private activeController: AbortController | null = null;
	private announcementGeneration = 0;
	private announcementPresenter: CalendarAnnouncementPresenter | null = null;
	private readonly actionGenerations = new Map<string, number>();
	private agendaVisibleCount: number;
	private currentEventsByDate: ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]> = new Map();
	private currentRange: CalendarRangeBounds | null = null;
	private dayButtons = new Map<string, HTMLButtonElement>();
	private displayedMonth: CalendarDate;
	private dom: CalendarDom | null = null;
	private eventReplacementSequence = 0;
	private focusedDate: CalendarDate;
	private generation = 0;
	private hasFatalError = false;
	private hasCurrentSnapshot = false;
	private contextAvailabilityFailureReported = false;
	private internalIssues: readonly InternalIssue[] = [];
	private isDestroyed = false;
	private isRendered = false;
	private isRetrying = false;
	private loadedRangeKey: string | null = null;
	private latestAcceptedEventReplacement = 0;
	private eventActions = new Map<string, CalendarEventActionElement>();
	private gridActionsByDate = new Map<string, readonly CalendarEventActionElement[]>();
	private gridMoreButtons = new Map<string, HTMLButtonElement>();
	private agendaMoreButton: HTMLButtonElement | null = null;
	private selectedDate: CalendarDate;
	private renderGeneration = 0;
	private selectionEntryDate: string | null = null;
	private state: CalendarState;

	public constructor(host: HTMLElement, options: CalendarOptions<TMetadata>) {
		if (!isHTMLElementLike(host)) {
			throw createConfigurationError("A valid HTMLElement host is required.");
		}
		const resolvedOptions = snapshotCalendarOptions<TMetadata>(options);
		const events = resolveCalendarEvents<TMetadata>(resolvedOptions);

		this.host = host;
		try {
			this.document = host.ownerDocument;
			this.window = this.document.defaultView;
			this.eventBaseUrl = this.document.baseURI;
		} catch (cause: unknown) {
			throw createConfigurationError("The host document could not be read.", cause);
		}
		this.fallbackElement = resolveFallbackElement(
			this.document,
			this.host,
			resolvedOptions.fallbackElement
		);
		this.abortControllerConstructor = this.window?.AbortController ?? globalThis.AbortController;
		this.eventSource = events;
		this.sourceEventLimit = normalizeIntegerOption(
			resolvedOptions.sourceEventLimit,
			SOURCE_EVENT_LIMIT_DEFAULT,
			SOURCE_EVENT_LIMIT_MINIMUM,
			SOURCE_EVENT_LIMIT_MAXIMUM,
			"sourceEventLimit"
		);
		this.gridEventLimit = normalizeIntegerOption(
			resolvedOptions.maxGridEventsPerDay,
			GRID_EVENT_LIMIT_DEFAULT,
			GRID_EVENT_LIMIT_MINIMUM,
			GRID_EVENT_LIMIT_MAXIMUM,
			"maxGridEventsPerDay"
		);
		this.agendaPageSize = normalizeIntegerOption(
			resolvedOptions.agendaPageSize,
			AGENDA_PAGE_SIZE_DEFAULT,
			AGENDA_PAGE_SIZE_MINIMUM,
			AGENDA_PAGE_SIZE_MAXIMUM,
			"agendaPageSize"
		);
		this.agendaDomLimit = normalizeIntegerOption(
			resolvedOptions.agendaDomLimit,
			AGENDA_DOM_LIMIT_DEFAULT,
			AGENDA_DOM_LIMIT_MINIMUM,
			AGENDA_DOM_LIMIT_MAXIMUM,
			"agendaDomLimit"
		);
		this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
		this.headingLevel = normalizeIntegerOption(resolvedOptions.headingLevel, 2, 1, 6, "headingLevel");
		if (resolvedOptions.swipe !== undefined && typeof resolvedOptions.swipe !== "boolean") {
			throw createConfigurationError("swipe must be a boolean.");
		}
		this.swipeEnabled = resolvedOptions.swipe ?? true;
		this.swipeGesture = new SwipeGestureController({
			canInteract: () => this.canContinueInteraction() && HOST_OWNERS.get(this.host) === this,
			enabled: this.swipeEnabled,
			getDom: () => this.dom,
			host: this.host,
			navigate: (amount) => this.shiftMonth(amount, true),
			window: this.window
		});

		const locale = normalizeLocale(resolvedOptions.locale);
		this.timeZone = normalizeTimeZone(resolvedOptions.timeZone);
		this.firstDay = resolveFirstDay(resolvedOptions.firstDay, locale);
		this.now = resolvedOptions.now ?? (() => new Date());
		this.minDate = this.resolveConfiguredBound(resolvedOptions.minDate, "minDate");
		this.maxDate = this.resolveConfiguredBound(resolvedOptions.maxDate, "maxDate");
		if (this.minDate !== undefined && this.maxDate !== undefined &&
			compareCalendarDates(this.minDate, this.maxDate) > 0) {
			throw createConfigurationError("minDate must not follow maxDate.");
		}
		this.bounds = new CalendarBounds(this.firstDay, this.minDate, this.maxDate);
		if (!this.bounds.hasAllowedRenderableMonth()) {
			throw createConfigurationError("minDate and maxDate do not contain a renderable calendar month.");
		}

		this.messages = resolveCalendarMessages(resolvedOptions.messages);
		const icons = resolveCalendarIcons(resolvedOptions.icons);
		this.iconNodes = resolveIconNodes(this.document, this.host, icons);
		this.toolbarEnd = resolveToolbarEnd(this.document, this.host, resolvedOptions.toolbarEnd);
		this.renderHooks = createRenderHookRuntimes(
			resolvedOptions.renderHooks,
			this.abortControllerConstructor
		);
		this.renderHookNodes = new RenderHookNodeRenderer({
			document: this.document,
			enabled: this.renderHooks.length > 0,
			host: this.host,
			isInvocationCurrent: (runtime, controller) =>
				this.isRenderHookInvocationCurrent(runtime, controller)
		});
		this.renderHookVisuals = new RenderHookVisualRenderer({
			appendNode: (runtime, hookName, container, result, requirePresentationalContent, surface) => {
				return this.renderHookNodes.append(
					runtime,
					hookName,
					container,
					result,
					requirePresentationalContent,
					surface
				);
			},
			document: this.document,
			renderHooks: this.renderHooks,
			isDestroyed: () => this.isDestroyed,
			isInvocationCurrent: (runtime, controller) =>
				this.isRenderHookInvocationCurrent(runtime, controller),
			quarantine: (runtime, hookName, cause, surface) => {
				this.quarantineRenderHook(runtime, hookName, cause, surface);
			},
			reportLateFailure: (runtime, hookName, cause, surface) => {
				this.reportLateRenderHookFailure(runtime, hookName, cause, surface);
			}
		});
		this.options = Object.freeze({
			...resolvedOptions,
			events,
			renderHooks: Object.freeze(this.renderHooks.map((runtime) => runtime.definition)),
			...getFallbackOption(this.fallbackElement),
			icons,
			...(this.maxDate === undefined ? {} : { maxDate: this.maxDate }),
			messages: this.messages,
			...(this.minDate === undefined ? {} : { minDate: this.minDate })
		});
		this.integrationNodes = new IntegrationNodeController({
			createDetachError: (cause) => createInternalError({
				cause,
				code: "host-integration-failed",
				hook: "destroy",
				message: "An application integration node could not be detached during destroy.",
				phase: "destroy",
				recoverable: false,
				severity: "warning",
				userMessage: this.messages.internalErrorMessage,
				userTitle: this.messages.internalErrorTitle
			}),
			createLeaseError: () => this.createPublicMethodError(
				"invalid-state",
				"render",
				"render() cannot claim integration nodes that are unavailable to this calendar host."
			),
			document: this.document,
			fallbackElement: this.fallbackElement,
			host: this.host,
			iconNodes: this.iconNodes,
			reportDetachError: (error) => { this.deliverError(error); },
			toolbarEnd: this.toolbarEnd
		});

		const today = this.getTodayDateForConstruction();
		const initialDate = resolvedOptions.initialDate === undefined
			? this.bounds.resolveImplicitInitialDate(today)
			: this.projectDateInput(resolvedOptions.initialDate);
		if (initialDate === null) {
			throw createConfigurationError("initialDate must be a valid supported civil date or Date.");
		}
		if (!this.bounds.isDateAllowed(initialDate)) {
			throw createConfigurationError("initialDate must fall within minDate and maxDate.");
		}
		this.displayedMonth = { day: 1, month: initialDate.month, year: initialDate.year };
		if (!isRenderableMonth(this.displayedMonth, this.firstDay)) {
			throw createConfigurationError("initialDate falls outside the renderable calendar range.");
		}
		this.selectedDate = initialDate;
		this.focusedDate = initialDate;
		this.instanceName = `lfc-${String(++instanceSequence)}`;

		this.dayFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			day: "numeric",
			timeZone: "UTC"
		});
		this.fullDateFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			day: "numeric",
			month: "long",
			timeZone: "UTC",
			weekday: "long",
			year: "numeric"
		});
		this.numberFormatter = new Intl.NumberFormat(locale);
		this.eventText = new CalendarEventText(locale, this.fullDateFormatter, this.messages, this.numberFormatter);
		this.eventOverflowPresenter = new CalendarEventOverflowPresenter({
			document: this.document,
			gridEventLimit: this.gridEventLimit,
			locale,
			messages: this.messages,
			numberFormatter: this.numberFormatter
		});
		this.monthNameFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			month: "long",
			timeZone: "UTC"
		});
		this.monthTitleRenderer = new CalendarMonthTitleRenderer({
			chooseMonthYear: this.messages.chooseMonthYear,
			locale
		});
		this.weekdayFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			timeZone: "UTC",
			weekday: "short"
		});
		this.weekdayNarrowFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			timeZone: "UTC",
			weekday: "narrow"
		});
		this.monthPickerController = new CalendarMonthPickerController({
			canContinue: () => this.canContinueInteraction(),
			document: this.document,
			getDisplayedMonth: () => this.displayedMonth,
			getElements: () => this.dom,
			getPreferredDay: () => this.selectedDate.day,
			isMonthAllowed: (month) => this.bounds.isMonthAllowed(month),
			onNavigate: (target) => { this.showDate(target, "jumpToMonthYear"); },
			resolveMonthTarget: (month, preferredDay) => this.bounds.resolveMonthTarget(month, preferredDay)
		});
		this.state = createState("idle", null, [], this.displayedMonth, this.selectedDate);
		this.registeredExtensions = this.createRegisteredExtensionHost(resolvedOptions.extensions);
	}

	/** Adds the calendar to its host and starts loading the visible month. */
	public render(): void {
		if (this.isDestroyed) {
			throw this.createPublicMethodError(
				"invalid-state",
				"render",
				"render() cannot be called after destroy()."
			);
		}
		if (this.isRendered) {
			return;
		}
		const existingOwner = HOST_OWNERS.get(this.host);
		if (existingOwner !== undefined && existingOwner !== this) {
			throw this.createPublicMethodError(
				"invalid-state",
				"render",
				"render() cannot claim a host owned by another live calendar instance."
			);
		}
		HOST_OWNERS.set(this.host, this);
		try {
			this.integrationNodes.claim();
		} catch (cause: unknown) {
			HOST_OWNERS.delete(this.host);
			this.integrationNodes.release();
			throw cause;
		}
		const activeBefore = getOwnedActiveElement(this.document, this.host);

		try {
			this.host.classList.add(ROOT_CLASS);
			this.host.setAttribute("data-litefold-calendar", "");
			if (this.swipeEnabled) {
				this.host.setAttribute("data-lfc-swipe-enabled", "true");
			}
			this.dom = this.createStructure();
			this.isRendered = true;
			this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
			this.loadVisibleEvents(false);
			this.registeredExtensions?.activate();
			if (this.activeController === null) {
				this.registeredExtensions?.notifyStateChanged();
			}
		} catch (cause: unknown) {
			this.isRendered = true;
			this.handleFatalError(cause, wasOwnedFocusRemoved(activeBefore, this.host));
		}
	}

	/** Aborts pending work, removes listeners, runs render-hook cleanup, and clears the host. */
	public destroy(): void {
		if (this.isDestroyed) {
			return;
		}

		this.isDestroyed = true;
		this.isRendered = false;
		this.monthPickerController.hide(false);
		this.generation += 1;
		this.registeredExtensions?.stop();
		this.actionGenerations.clear();
		this.resetInternalAnnouncement();
		this.activeController?.abort();
		this.activeController = null;
		const ownsHost = HOST_OWNERS.get(this.host) === this;
		this.swipeGesture.disconnect(ownsHost);
		for (const runtime of this.renderHooks) {
			runtime.controller.abort();
			const cleanupErrors = this.runRenderHookCleanups(runtime);
			cleanupErrors.push(...releaseLeasedNodes(runtime.nodes, runtime.leaseToken));
			cleanupErrors.push(...this.renderHookVisuals.clearFallbackTracking(runtime));
			if (cleanupErrors.length > 0) {
				this.reportRenderHookCleanupErrors(runtime, cleanupErrors, false);
			}
		}
		if (ownsHost) {
			this.integrationNodes.detachMountedNodes();
			this.host.replaceChildren();
			this.host.classList.remove(
				ROOT_CLASS
			);
			this.host.removeAttribute("data-litefold-calendar");
			this.host.removeAttribute("data-lfc-swipe-enabled");
			this.host.removeAttribute("data-lfc-swipe-state");
			this.host.removeAttribute("aria-busy");
			HOST_OWNERS.delete(this.host);
		}
		this.integrationNodes.restoreFallback();
		this.integrationNodes.release();
		this.dom = null;
		this.announcementPresenter = null;
		this.currentEventsByDate = new Map();
		this.currentRange = null;
		this.dayButtons.clear();
		this.eventActions.clear();
		this.gridActionsByDate.clear();
		this.gridMoreButtons.clear();
		this.agendaMoreButton = null;
		this.hasCurrentSnapshot = false;
		this.internalIssues = [];
		this.setState("destroyed");
	}

	/** Replaces the complete event input and loads the current visible range. */
	public setEvents(events: CalendarEvents<TMetadata>): void {
		this.requireLive("setEvents");
		const replacementSequence = ++this.eventReplacementSequence;
		let resolvedEvents: CalendarEvents<TMetadata>;
		try {
			resolvedEvents = resolveCalendarEvents<TMetadata>({ events });
		} catch (cause: unknown) {
			throw this.createPublicMethodError(
				"invalid-argument",
				"setEvents",
				"setEvents(events) requires a readable static event array or event source function.",
				cause
			);
		}
		if (!this.canContinueInteraction() ||
			replacementSequence < this.latestAcceptedEventReplacement) {
			return;
		}
		this.latestAcceptedEventReplacement = replacementSequence;
		this.eventSource = resolvedEvents;
		this.swipeGesture.clear();
		this.loadVisibleEvents(false);
	}

	/** Forces the current visible range to be loaded again. */
	public refetchEvents(): void {
		this.requireLive("refetchEvents");
		this.swipeGesture.clear();
		this.loadVisibleEvents(true);
	}

	/** Moves to the month containing a supported civil date, string, or instant. */
	public gotoDate(value: CalendarDateInput): void {
		this.requireLive("gotoDate");
		const date = this.projectDateInput(value);
		if (date === null) {
			throw this.createPublicMethodError(
				"invalid-argument",
				"gotoDate",
				"gotoDate(date) requires a valid supported civil date or Date."
			);
		}
		this.showDate(date, "gotoDate");
	}

	/** Selects and focuses a supported civil date, string, or instant. */
	public focusDate(value: CalendarDateInput): void {
		this.requireLive("focusDate");
		const date = this.projectDateInput(value);
		if (date === null) {
			throw this.createPublicMethodError(
				"invalid-argument",
				"focusDate",
				"focusDate(date) requires a valid supported civil date or Date."
			);
		}
		this.selectDate(date, "focusDate");
	}

	/** Selects and focuses the date returned by the configured clock. */
	public focusToday(): void {
		this.requireLive("focusToday");
		this.navigateToToday(true);
	}

	/** Moves to the previous month. */
	public prev(): void {
		this.requireLive("prev");
		this.shiftMonth(-1);
	}

	/** Moves to the next month. */
	public next(): void {
		this.requireLive("next");
		this.shiftMonth(1);
	}

	/** Moves to the date returned by the configured clock. */
	public today(): void {
		this.requireLive("today");
		this.navigateToToday(false);
	}

	/** Returns an immutable state snapshot without raw error causes. */
	public getState(): CalendarState {
		return this.state;
	}

	private createRegisteredExtensionHost(
		extensions: readonly CalendarExtension[] | undefined
	): RegisteredExtensionHost<TMetadata> | null {
		return createRegisteredExtensionHost(extensions === undefined ? null : {
			abortControllerConstructor: this.abortControllerConstructor,
			document: this.document,
			extensions,
			getEventsByDate: () => this.currentEventsByDate,
			getGeneration: () => this.generation,
			getSelectedDate: () => this.selectedDate,
			getState: () => this.state,
			hasCurrentSnapshot: () => this.hasCurrentSnapshot,
			isDateAllowed: (date) => this.bounds.isDateAllowed(date),
			isLive: () => this.canContinueInteraction(),
			performNavigation: (target, navigationRevision) => {
				this.performExtensionNavigation(target, navigationRevision);
			},
			reportFailure: (extensionId, hook, cause) => {
				this.reportRegisteredExtensionFailure(extensionId, hook, cause);
			}
		});
	}

	private performExtensionNavigation(
		target: RegisteredExtensionNavigationTarget,
		navigationRevision: number
	): void {
		switch (target.target) {
			case "date": this.showDate(target.date, "gotoDate", false, navigationRevision); break;
			case "today": this.navigateToToday(false, navigationRevision); break;
			case "previous-month": this.shiftMonth(-1, false, navigationRevision); break;
			case "next-month": this.shiftMonth(1, false, navigationRevision); break;
		}
	}

	private claimNavigation(navigationRevision?: number): number | null {
		return this.registeredExtensions === null ? 0 :
			this.registeredExtensions.claimNavigation(navigationRevision); }

	private isNavigationCurrent(navigationRevision: number): boolean { return this.registeredExtensions?.isNavigationCurrent(navigationRevision) ?? true; }
	private canCompleteNavigation(navigationRevision: number): boolean { return this.canContinueInteraction() && this.isNavigationCurrent(navigationRevision); }

	private createStructure(): CalendarDom {
		const dom = createCalendarStructure(this.options, {
			document: this.document,
			headingLevel: this.headingLevel,
			host: this.host,
			iconNodes: this.iconNodes,
			instanceName: this.instanceName,
			integrationParents: this.integrationNodes.parents,
			maxYear: this.maxDate?.year ?? 9_999,
			messages: this.messages,
			minYear: this.minDate?.year ?? 1,
			monthNameFormatter: this.monthNameFormatter,
			onMonthPickerBeforeToggle: this.monthPickerController.handleBeforeToggle,
			onMonthPickerCancel: this.monthPickerController.handleCancel,
			onMonthPickerSubmit: this.monthPickerController.handleSubmit,
			onMonthPickerTitleClick: this.monthPickerController.handleTitleClick,
			onMonthPickerToggle: this.monthPickerController.handleToggle,
			onMonthPickerYearInput: this.monthPickerController.handleYearInput,
			onNavigate: (direction) => {
				if (this.canContinueInteraction()) {
					this.shiftMonth(direction === "next" ? 1 : -1);
				}
			},
			onRetry: this.handleRetry,
			onToday: (event) => {
				const target = event.currentTarget as HTMLButtonElement | null;
				if (this.canContinueInteraction() && target?.getAttribute("aria-disabled") !== "true") {
					this.navigateToToday(false);
				}
			},
			toolbarEnd: this.toolbarEnd
		});
		this.announcementPresenter = new CalendarAnnouncementPresenter(dom);
		if (!this.hasFatalError) {
			this.swipeGesture.connect(dom);
		}
		return dom;
	}

	private updateMonthTitle(dom: Readonly<CalendarDom>): void {
		this.monthTitleRenderer.render(dom, this.displayedMonth);
	}

	private renderCalendar(): boolean {
		if (this.hasFatalError) {
			return false;
		}
		const activeBefore = getOwnedActiveElement(this.document, this.host);
		try {
			this.renderCalendarUnsafe();
			return true;
		} catch (cause: unknown) {
			this.handleFatalError(cause, wasOwnedFocusRemoved(activeBefore, this.host));
			return false;
		}
	}

	private renderCalendarUnsafe(): void {
		const dom = this.dom;
		if (!this.isRendered || this.isDestroyed || dom === null) {
			return;
		}
		this.swipeGesture.prepareForRender(dom);

		const focus = captureCalendarFocus(
			this.document.activeElement, this.host, this.dom, this.getGridFocusElements());
		let remainingRecoveryAttempts = this.renderHooks.filter((runtime) => !runtime.quarantined).length;
		while (remainingRecoveryAttempts >= 0) {
			const quarantinedBeforeAttempt = this.getQuarantinedRenderHookCount();
			this.renderHookNodes.beginRenderPass();
			const renderGeneration = ++this.renderGeneration;
			this.prepareRenderHooksForRender(renderGeneration);
			if (this.wasRenderInterrupted(dom, renderGeneration)) {
				return;
			}
			this.updateMonthTitle(dom);
			dom.titleButton.removeAttribute("aria-disabled");
			const today = this.getTodayDate(false);
			this.updateNavigationAvailability(dom, today);
			this.renderWeekdays(dom.weekdays);
			const dayButtons = new Map<string, HTMLButtonElement>(), gridMoreButtons = new Map<string, HTMLButtonElement>();
			const eventActions = new Map<string, CalendarEventActionElement>();
			const gridActionsByDate = new Map<string, readonly CalendarEventActionElement[]>();
			const dayMounts: DayMountRegistration[] | null = this.renderHooks.length === 0 ? null : [];
			const eventMounts: EventMountRegistration<TMetadata>[] | null = dayMounts === null ? null : [];
			const days = getCalendarMonthRange(this.displayedMonth, this.firstDay).days;
			const renderedGrid = renderMonthWeeks(dom.weeks, days, (date) => this.createDayCell(
				date, today, dayButtons, eventActions, gridActionsByDate, gridMoreButtons,
				dayMounts, eventMounts, renderGeneration
			), () => !this.wasRenderInterrupted(dom, renderGeneration), (weeks) => {
				this.renderHookNodes.sealPackageSkeleton(
					dom.weeks, weeks, [dom.grid, dom.swipeViewport, this.host], 2);
			});
			if (!renderedGrid || this.wasRenderInterrupted(dom, renderGeneration)) {
				return;
			}
			this.selectionEntryDate = null;
			this.renderAgenda(dom, eventActions, eventMounts, renderGeneration);
			if (this.wasRenderInterrupted(dom, renderGeneration)) {
				return;
			}
			let newlyQuarantined = this.getQuarantinedRenderHookCount() - quarantinedBeforeAttempt;
			if (newlyQuarantined === 0) { newlyQuarantined = this.validateMountedRenderHookNodes(); }
			if (this.wasRenderInterrupted(dom, renderGeneration)) {
				return;
			}
			if (newlyQuarantined > 0) {
				remainingRecoveryAttempts -= newlyQuarantined;
				continue;
			}
			this.dayButtons = dayButtons;
			this.eventActions = eventActions;
			this.gridActionsByDate = gridActionsByDate;
			this.gridMoreButtons = gridMoreButtons;
			if (dayMounts !== null && eventMounts !== null) {
				this.runMountHooks(dayMounts, eventMounts);
			}
			if (this.wasRenderInterrupted(dom, renderGeneration)) {
				return;
			}
			this.renderIssues();
			restoreCalendarFocus(focus, this.dom, this.getGridFocusElements(),
				formatCalendarDate(this.focusedDate), this.host);
			return;
		}
		throw new TypeError("Render-hook recovery exceeded the configured hook-set bound.");
	}

	private renderWeekdays(container: HTMLElement): void {
		renderWeekdayHeadings(container, {
			document: this.document,
			firstDay: this.firstDay,
			formatFullDate: (date) => this.fullDateFormatter.formatToParts(date)
				.find((part) => part.type === "weekday")?.value ?? this.weekdayFormatter.format(date),
			formatNarrow: (date) => this.weekdayNarrowFormatter.format(date),
			formatShort: (date) => this.weekdayFormatter.format(date)
		});
	}

	private createDayCell(
		date: CalendarDate,
		today: CalendarDate | null,
		dayButtons: Map<string, HTMLButtonElement>,
		eventActions: Map<string, CalendarEventActionElement>,
		gridActionsByDate: Map<string, readonly CalendarEventActionElement[]>,
		gridMoreButtons: Map<string, HTMLButtonElement>,
		dayMounts: DayMountRegistration[] | null,
		eventMounts: EventMountRegistration<TMetadata>[] | null,
		renderGeneration: number
	): HTMLDivElement {
		const isAllowed = this.bounds.isDateAllowed(date);
		const isCurrentMonth = date.year === this.displayedMonth.year && date.month === this.displayedMonth.month;
		const isSelected = compareCalendarDates(date, this.selectedDate) === 0;
		const isToday = today !== null && compareCalendarDates(date, today) === 0;
		const isFocused = isAllowed && compareCalendarDates(date, this.focusedDate) === 0;
		const dateString = formatCalendarDate(date);
		const events = isAllowed ? this.currentEventsByDate.get(dateString) ?? [] : [];
		const fullDateText = this.eventText.formatFullDate(date);
		const accessibleLabel = isAllowed
			? this.eventText.getDayAccessibleLabel(fullDateText, events.length)
			: fullDateText;
		const {
			badge,
			button,
			cell,
			number,
			summaries
		} = createDayCellElements({
			accessibleLabel,
			dateString,
			dayNumber: this.dayFormatter.format(toUtcDate(date)),
			document: this.document,
			isAllowed,
			isCurrentMonth,
			isFocused,
			isSelected,
			isToday,
			selectionEntryDate: this.selectionEntryDate
		});
		const dayElements = Object.freeze({ badge, button, cell, number, summaries });
		this.renderHookSlot("renderDayBadge", badge, (signal) => ({
			date: { ...date },
			dateString,
			document: this.document,
			elements: dayElements,
			isCurrentMonth,
			isSelected,
			isToday,
			signal,
			surface: "day" as const
		}), Object.values(dayElements));
		if (!this.isRenderGenerationCurrent(renderGeneration)) {
			return cell;
		}
		const gridActions = new DayGridActionCollector(eventActions);
		for (const event of events.slice(0, this.gridEventLimit)) {
			const rendered = this.createEventRepresentation(
				event,
				date,
				"grid-summary",
				eventMounts,
				fullDateText,
				renderGeneration
			);
			if (rendered === null) {
				return cell;
			}
			gridActions.registerEvent(
				getEventActionKey("grid-summary", dateString, event.event.id),
				rendered.elements
			);
			summaries.append(rendered.elements.root);
		}
		const eventOverflow = this.eventOverflowPresenter.prepareAndPlace({
			compactPrimary: gridActions.compactPrimary,
			date,
			dateString,
			eventCount: events.length,
			fullDateText,
			summaries
		});
		if (eventOverflow.grid !== null) {
			const { button: gridMore } = eventOverflow.grid;
			installGridOverflowActionListeners({
				action: gridMore,
				isCurrent: () => this.canUseRenderedAction(gridMore, renderGeneration),
				onActivate: () => {
					this.selectDate(date, "gridMore");
					if (this.canContinueInteraction()) {
						this.dom?.agendaTitle.focus({ preventScroll: true });
					}
				},
				onKeydown: (event) => {
					this.handleRenderedGridActionKeydown(
						event, dateString, gridMore, renderGeneration);
				}
			});
		}
		if (eventOverflow.compact !== null) {
			this.renderHookVisuals.renderEventOverflow(eventOverflow.compact);
			if (!this.isRenderGenerationCurrent(renderGeneration)) {
				return cell;
			}
		}
		if (eventOverflow.grid !== null) {
			const { button: gridMore, wide } = eventOverflow.grid;
			this.renderHookVisuals.renderEventOverflow(wide);
			if (!this.isRenderGenerationCurrent(renderGeneration)) {
				return cell;
			}
			gridActions.registerOverflow(gridMore);
			gridMoreButtons.set(dateString, gridMore);
			summaries.append(gridMore);
		}
		const gridActionSnapshot = gridActions.snapshot();
		gridActionsByDate.set(dateString, gridActionSnapshot);
		button.addEventListener("click", (jsEvent) => {
			if (!this.canUseRenderedAction(button, renderGeneration) || !this.bounds.isDateAllowed(date) ||
				!isRenderableMonth({ day: 1, month: date.month, year: date.year }, this.firstDay)) {
				return;
			}
			this.selectDate(date, "onDaySelect", true);
			if (this.isDestroyed) {
				return;
			}
			const selectedButton = this.dayButtons.get(dateString);
			if (selectedButton === undefined) {
				return;
			}
			const context = createDaySelection(jsEvent, date, selectedButton);
			const onDaySelect = this.options.onDaySelect;
			if (onDaySelect !== undefined) {
				this.invokeAction("onDaySelect", () => onDaySelect(context));
			}
		});
		button.addEventListener("keydown", (event) => {
			if (!this.canUseRenderedAction(button, renderGeneration)) {
				return;
			}
			if (event.key === "F2" && gridActionSnapshot.length > 0) {
				event.preventDefault();
				enterGridActions(dateString, this.getGridFocusElements(), this.host);
				return;
			}
			this.handleDayKeydown(event, date, button);
		});
		const dayShortcuts = [
			...(gridActionSnapshot.length > 0 ? ["F2"] : []),
			...(this.options.onDayContextMenu === undefined ? [] : ["Shift+F10"])
		];
		if (dayShortcuts.length > 0) {
			button.setAttribute("aria-keyshortcuts", dayShortcuts.join(" "));
		}
		if (this.options.onDayContextMenu !== undefined) {
			button.addEventListener("contextmenu", (jsEvent) => {
				if (jsEvent.defaultPrevented || !this.canUseRenderedAction(button, renderGeneration) ||
					!this.bounds.isDateAllowed(date)) {
					return;
				}
				jsEvent.preventDefault();
				this.invokeDayContextMenu(jsEvent, date, button, jsEvent.clientX, jsEvent.clientY);
			});
		}
		dayButtons.set(dateString, button);
		dayMounts?.push({
			context: Object.freeze({
				date: Object.freeze({ ...date }),
				dateString,
				elements: Object.freeze({ badge, button, cell, number, summaries }),
				isCurrentMonth,
				isSelected,
				isToday,
				surface: "day"
			})
		});
		return cell;
	}

	private createEventRepresentation(
		event: NormalizedCalendarEvent<TMetadata>,
		date: CalendarDate,
		surface: CalendarEventSurface,
		eventMounts: EventMountRegistration<TMetadata>[] | null,
		fullDateText: string,
		renderGeneration: number
	): Readonly<EventRepresentation> | null {
		const hasContextAction = this.isEventContextMenuAvailable(event.event, date, surface);
		if (!this.isRenderGenerationCurrent(renderGeneration)) {
			return null;
		}
		const dateString = formatCalendarDate(date);
		const timeText = this.eventText.getEventTimeText(event, date);
		const hasApplicationAction = this.options.onEventActivate !== undefined || hasContextAction;
		const representation = createEventDomRepresentation({
			accessibleLabel: surface === "grid-summary" &&
				(event.event.url !== null || hasApplicationAction)
				? this.eventText.getEventAccessibleLabel(event, timeText, fullDateText)
				: "",
			dateString,
			document: this.document,
			event,
			hasApplicationAction,
			surface,
			timeDisplay: this.options.eventTimeDisplay ?? "all",
			timeText
		});
		const { action, details, marker, trailing } = representation.elements;
		if (this.renderHooks.length === 0) {
			marker.append(createEventAccent(this.document, event.event.accentColor));
		} else {
			const protectedEventElements = getEventRenderHookProtectedElements(representation.elements);
			const makeContext = (signal: AbortSignal): Readonly<Record<string, unknown>> => ({
				date: Object.freeze({ ...date }),
				dateString,
				document: this.document,
				elements: representation.elements,
				event: event.event,
				signal,
				surface,
				timeText
			});
			this.renderHookVisuals.renderEventMarker(
				marker, event.event.accentColor, protectedEventElements, makeContext);
			if (!this.isRenderGenerationCurrent(renderGeneration)) {
				return null;
			}
			this.renderHookSlot(
				"renderEventLeading", representation.slots.leadingContent, makeContext, protectedEventElements);
			if (!this.isRenderGenerationCurrent(renderGeneration)) {
				return null;
			}
			this.renderHookSlot("renderEventDetails", details, makeContext, protectedEventElements);
			if (!this.isRenderGenerationCurrent(renderGeneration)) {
				return null;
			}
			this.renderHookSlot("renderEventTrailing", trailing, makeContext, protectedEventElements);
		}
		if (!this.isRenderGenerationCurrent(renderGeneration)) {
			return null;
		}
		if (action !== null) {
			this.installEventActionListeners(
				action,
				event.event,
				date,
				surface,
				hasContextAction,
				renderGeneration
			);
		}
		eventMounts?.push({
			context: createEventMountContext(
				representation.elements,
				date,
				dateString,
				event.event,
				surface,
				timeText
			)
		});
		return representation;
	}

	private installEventActionListeners(
		action: CalendarEventActionElement,
		calendarEvent: CalendarEvent<TMetadata>,
		date: CalendarDate,
		surface: CalendarEventSurface,
		hasContextAction: boolean,
		renderGeneration: number
	): void {
		const onEventActivate = this.options.onEventActivate;
		installNativeEventActionListeners({
			action,
			hasContextAction,
			isCurrent: () => this.canUseRenderedAction(action, renderGeneration),
			onActivate: onEventActivate === undefined ? null : (nativeEvent) => {
				const context = createEventActivation(nativeEvent, date, action, calendarEvent, surface);
				this.invokeAction("onEventActivate", () => onEventActivate(context));
			},
			onContext: hasContextAction ? (nativeEvent, clientX, clientY) => {
				this.invokeEventContextMenu(
					nativeEvent,
					date,
					action,
					calendarEvent,
					surface,
					clientX,
					clientY
				);
			} : null,
			onGridKeydown: surface === "grid-summary" ? (nativeEvent) => {
				this.handleRenderedGridActionKeydown(
					nativeEvent,
					formatCalendarDate(date),
					action,
					renderGeneration
				);
			} : null,
			surface
		});
	}

	private isEventContextMenuAvailable(
		event: CalendarEvent<TMetadata>,
		date: CalendarDate,
		surface: CalendarEventSurface
	): boolean {
		if (this.options.onEventContextMenu === undefined) {
			return false;
		}
		const predicate = this.options.isEventContextMenuAvailable;
		if (predicate === undefined) {
			return true;
		}

		let result: unknown;
		try {
			result = invokeForUnknownResult(predicate, [
				createEventContextMenuAvailability(date, event, surface)
			]);
		} catch (cause: unknown) {
			this.reportContextAvailabilityFailure(cause);
			return false;
		}
		if (typeof result === "boolean") {
			return result && this.canContinueInteraction();
		}
		if (observeThenable(result, () => undefined)) {
			this.reportContextAvailabilityFailure(new TypeError(
				"isEventContextMenuAvailable must return a boolean synchronously; thenables are not supported."
			));
			return false;
		}
		this.reportContextAvailabilityFailure(new TypeError(
			"isEventContextMenuAvailable must return a boolean synchronously."
		));
		return false;
	}

	private reportContextAvailabilityFailure(cause: unknown): void {
		if (this.contextAvailabilityFailureReported || this.isDestroyed) {
			return;
		}
		this.contextAvailabilityFailureReported = true;
		this.recordHostIntegrationFailure(
			"isEventContextMenuAvailable",
			cause,
			true,
			"default"
		);
	}

	private renderAgenda(
		dom: CalendarDom,
		eventActions: Map<string, CalendarEventActionElement>,
		eventMounts: EventMountRegistration<TMetadata>[] | null,
		renderGeneration: number
	): void {
		const { agendaFooter: footer, agendaList: list, agendaTitle: title } = dom;
		const selectedDateString = formatCalendarDate(this.selectedDate);
		const fullDateText = this.eventText.formatFullDate(this.selectedDate);
		const titleText = formatCalendarMessage(this.messages.agendaTitle, {
			date: fullDateText
		});
		const events = this.currentEventsByDate.get(selectedDateString) ?? [];
		const visibleCount = this.hasCurrentSnapshot
			? Math.min(events.length, this.agendaVisibleCount, this.agendaDomLimit)
			: 0;
		const entries: Readonly<AgendaEventEntry>[] = [];
		for (const event of this.hasCurrentSnapshot ? events.slice(0, visibleCount) : []) {
			const rendered = this.createEventRepresentation(
				event,
				this.selectedDate,
				"agenda",
				eventMounts,
				fullDateText,
				renderGeneration
			);
			if (rendered === null) {
				return;
			}
			entries.push(Object.freeze({
				action: rendered.elements.action,
				eventId: event.event.id,
				root: rendered.elements.root
			}));
			if (this.wasRenderInterrupted(dom, renderGeneration)) {
				return;
			}
		}
		const hasOverflow = this.hasCurrentSnapshot && visibleCount < events.length;
		const canRevealMore = hasOverflow && visibleCount < this.agendaDomLimit;
		const revealCount = canRevealMore
			? Math.min(this.agendaPageSize, this.agendaDomLimit - visibleCount, events.length - visibleCount)
			: 0;
		const moreText = canRevealMore
			? formatCalendarMessage(this.messages.agendaMore, {
				count: this.numberFormatter.format(revealCount)
			})
			: null;
		const progressText = hasOverflow
			? formatCalendarMessage(this.messages.agendaProgress, {
				total: this.numberFormatter.format(events.length),
				visible: this.numberFormatter.format(visibleCount)
			})
			: null;
		const presentation = createAgendaPresentation({
			document: this.document,
			emptyText: this.messages.agendaEmpty,
			entries: Object.freeze(entries),
			hasSnapshot: this.hasCurrentSnapshot,
			moreText,
			progressText,
			titleText,
			totalEventCount: events.length
		});
		if (this.wasRenderInterrupted(dom, renderGeneration)) {
			return;
		}

		const more = presentation.moreButton;
		if (more !== null) {
			more.addEventListener("click", () => {
				if (!this.canUseRenderedAction(more, renderGeneration)) {
					return;
				}
				const firstRevealedEventId = events[visibleCount]?.event.id;
				this.agendaVisibleCount = Math.min(
					this.agendaVisibleCount + this.agendaPageSize,
					this.agendaDomLimit
				);
				this.renderCalendar();
				const visibleAfter = Math.min(events.length, this.agendaVisibleCount, this.agendaDomLimit);
				const focusTarget = firstRevealedEventId === undefined
					? this.dom?.agendaTitle ?? null
					: this.eventActions.get(getEventActionKey(
						"agenda",
						selectedDateString,
						firstRevealedEventId
					)) ?? this.dom?.agendaTitle ?? null;
				focusTarget?.focus({ preventScroll: true });
				this.announce({
					message: formatCalendarMessage(this.messages.agendaProgress, {
						total: this.numberFormatter.format(events.length),
						visible: this.numberFormatter.format(visibleAfter)
					}),
					politeness: "polite"
				});
			});
		}
		for (const reference of presentation.actionReferences) {
			eventActions.set(
				getEventActionKey("agenda", selectedDateString, reference.eventId),
				reference.action
			);
		}
		title.textContent = presentation.titleText;
		list.hidden = presentation.listHidden;
		if (eventMounts !== null) {
			this.renderHookNodes.sealPackageSkeleton(
				list, presentation.listItems, [dom.agenda, this.host], 1);
		}
		list.replaceChildren(...presentation.listItems);
		footer.replaceChildren(...presentation.footerChildren);
		this.agendaMoreButton = more;
	}

	private renderHookSlot(
		hookName: "renderDayBadge" | "renderEventDetails" | "renderEventLeading" | "renderEventTrailing",
		container: HTMLElement,
		createContext: (signal: AbortSignal) => Readonly<Record<string, unknown>>,
		protectedElements: readonly (HTMLElement | null)[]
	): void {
		for (const runtime of this.renderHooks) {
			if (this.wasRuntimeDestroyed()) {
				return;
			}
			if (this.wasRenderHookQuarantined(runtime)) {
				continue;
			}
			const hook = runtime.definition[hookName] as ((context: unknown) => Node | null | undefined) | undefined;
			if (hook === undefined) {
				continue;
			}
			const controller = runtime.controller;
			const context = Object.freeze(createContext(controller.signal));
			const surface = context["surface"];
			try {
				const elementIntegrity = captureRenderHookElementIntegrity(protectedElements);
				const result = hook(context);
				const returnedThenable = observeThenable(result, (cause) => {
					this.reportLateRenderHookFailure(runtime, hookName, cause, surface);
				});
				if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
					if (returnedThenable) {
						this.reportLateRenderHookFailure(
							runtime,
							hookName,
							new TypeError(`${hookName} must return a node synchronously.`),
							surface
						);
					}
					return;
				}
				assertRenderHookElementIntegrity(elementIntegrity, hookName);
				if (returnedThenable) {
					throw new TypeError(`${hookName} must return a node synchronously.`);
				}
				if (result === null || result === undefined) {
					continue;
				}
				this.renderHookNodes.append(runtime, hookName, container, result, false, surface);
			} catch (cause: unknown) {
				if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
					this.reportLateRenderHookFailure(runtime, hookName, cause, surface);
					return;
				}
				this.quarantineRenderHook(runtime, hookName, cause, surface);
			}
		}
	}

	private validateMountedRenderHookNodes(): number {
		const quarantinedBeforeValidation = this.getQuarantinedRenderHookCount();
		for (const failure of this.renderHookNodes.getMountedValidationFailures(this.renderHooks)) {
			this.quarantineRenderHook(
				failure.runtime, failure.hookName, failure.cause, failure.surface);
		}
		return this.getQuarantinedRenderHookCount() - quarantinedBeforeValidation;
	}

	private getQuarantinedRenderHookCount(): number { return this.renderHooks.filter((runtime) => runtime.quarantined).length; }

	private runMountHooks(
		dayMounts: readonly DayMountRegistration[],
		eventMounts: readonly EventMountRegistration<TMetadata>[]
	): void {
		for (const runtime of this.renderHooks) {
			if (this.wasRuntimeDestroyed()) {
				return;
			}
			if (this.wasRenderHookQuarantined(runtime)) {
				continue;
			}
			const dayHook = runtime.definition.dayDidMount as ((context: unknown) => unknown) | undefined;
			if (dayHook !== undefined) {
				for (const registration of dayMounts) {
					if (!this.invokeMountHook(runtime, "dayDidMount", dayHook, registration.context)) {
						break;
					}
				}
			}
			if (this.wasRuntimeDestroyed()) {
				return;
			}
			if (this.wasRenderHookQuarantined(runtime)) {
				continue;
			}
			const eventHook = runtime.definition.eventDidMount as ((context: unknown) => unknown) | undefined;
			if (eventHook !== undefined) {
				for (const registration of eventMounts) {
					if (!this.invokeMountHook(runtime, "eventDidMount", eventHook, registration.context)) {
						break;
					}
				}
			}
		}
	}

	private invokeMountHook(
		runtime: RenderHookRuntime<TMetadata>,
		hookName: "dayDidMount" | "eventDidMount",
		hook: (context: unknown) => unknown,
		context: Readonly<Record<string, unknown>>
	): boolean {
		const controller = runtime.controller;
		try {
			const cleanup = hook(Object.freeze({
				...context,
				document: this.document,
				signal: controller.signal
			}));
			if (cleanup !== undefined) {
				const returnedThenable = observeThenable(cleanup, (cause) => {
					this.reportLateRenderHookFailure(runtime, hookName, cause, context["surface"]);
				});
				if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
					if (typeof cleanup === "function") {
						this.runDetachedRenderHookCleanup(runtime, cleanup as () => void);
					} else if (returnedThenable) {
						this.reportLateRenderHookFailure(
							runtime,
							hookName,
							new TypeError(`${hookName} must return a cleanup function synchronously.`),
							context["surface"]
						);
					}
					return false;
				}
				if (returnedThenable) {
					throw new TypeError(`${hookName} must return a cleanup function synchronously.`);
				}
				if (typeof cleanup !== "function") {
					throw new TypeError(`${hookName} must return a cleanup function or void.`);
				}
				runtime.cleanups.push(cleanup as () => void);
			}
			return this.isRenderHookInvocationCurrent(runtime, controller);
		} catch (cause: unknown) {
			if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
				this.reportLateRenderHookFailure(runtime, hookName, cause, context["surface"]);
				return false;
			}
			this.quarantineRenderHook(runtime, hookName, cause, context["surface"]);
			return false;
		}
	}

	private prepareRenderHooksForRender(renderGeneration: number): void {
		for (const runtime of this.renderHooks) {
			if (!this.isRenderGenerationCurrent(renderGeneration)) {
				return;
			}
			if (runtime.quarantined) {
				continue;
			}
			const previousController = runtime.controller;
			previousController.abort();
			if (!this.isRenderHookPreparationCurrent(runtime, previousController, renderGeneration)) {
				return;
			}
			const controller = runtime.createController();
			runtime.controller = controller;
			const cleanupErrors = this.runRenderHookCleanups(runtime);
			if (!this.isRenderHookPreparationCurrent(runtime, controller, renderGeneration)) {
				this.handleRenderHookPreparationErrors(runtime, cleanupErrors);
				return;
			}
			cleanupErrors.push(...releaseLeasedNodes(runtime.nodes, runtime.leaseToken));
			if (!this.isRenderHookPreparationCurrent(runtime, controller, renderGeneration)) {
				this.handleRenderHookPreparationErrors(runtime, cleanupErrors);
				return;
			}
			if (cleanupErrors.length > 0) {
				this.handleRenderHookPreparationErrors(runtime, cleanupErrors);
			} else {
				const fallbackErrors = this.renderHookVisuals.clearFallbackTracking(runtime);
				if (fallbackErrors.length > 0) {
					this.handleRenderHookPreparationErrors(runtime, fallbackErrors);
				}
			}
		}
	}

	private handleRenderHookPreparationErrors(
		runtime: RenderHookRuntime<TMetadata>,
		errors: readonly unknown[]
	): void {
		if (errors.length === 0) {
			return;
		}
		if (this.isDestroyed || runtime.quarantined) {
			this.reportRenderHookCleanupErrors(runtime, errors, false);
			return;
		}
		this.quarantineRenderHook(
			runtime,
			"cleanup",
			errors.length === 1 ? errors[0] : new AggregateError(errors),
			undefined
		);
	}

	private runRenderHookCleanups(runtime: RenderHookRuntime<TMetadata>): unknown[] {
		const errors: unknown[] = [];
		const cleanups = runtime.cleanups.splice(0);
		for (const cleanup of cleanups) {
			try {
				const result = invokeForUnknownResult(cleanup, []);
				if (observeThenable(result, (cause) => {
					this.reportRenderHookCleanupErrors(runtime, [cause], this.isRendered && !this.isDestroyed);
				})) {
					errors.push(new TypeError("Render-hook cleanup callbacks must return void synchronously."));
				}
			} catch (cause: unknown) {
				errors.push(cause);
			}
		}
		return errors;
	}

	private runDetachedRenderHookCleanup(runtime: RenderHookRuntime<TMetadata>, cleanup: () => void): void {
		const cleanupErrors: unknown[] = [];
		try {
			const result = invokeForUnknownResult(cleanup, []);
			if (observeThenable(result, (cause) => {
				this.reportRenderHookCleanupErrors(runtime, [cause], false);
			})) {
				cleanupErrors.push(new TypeError("Render-hook cleanup callbacks must return void synchronously."));
			}
		} catch (cause: unknown) {
			cleanupErrors.push(cause);
		}
		if (cleanupErrors.length > 0) {
			this.reportRenderHookCleanupErrors(runtime, cleanupErrors, false);
		}
	}

	private isRenderHookInvocationCurrent(
		runtime: RenderHookRuntime<TMetadata>,
		controller: AbortController
	): boolean {
		return !this.isDestroyed && !runtime.quarantined && runtime.controller === controller &&
			!controller.signal.aborted;
	}

	private isRenderHookPreparationCurrent(runtime: RenderHookRuntime<TMetadata>, controller: AbortController,
		renderGeneration: number): boolean {
		return this.isRenderGenerationCurrent(renderGeneration) && !runtime.quarantined &&
			runtime.controller === controller;
	}

	private quarantineRenderHook(
		runtime: RenderHookRuntime<TMetadata>,
		hook: string,
		cause: unknown,
		surface: unknown
	): void {
		if (runtime.quarantined) {
			return;
		}
		runtime.quarantined = true;
		runtime.controller.abort();
		const nodeErrors = releaseLeasedNodes(runtime.nodes, runtime.leaseToken);
		const fallbackErrors = this.renderHookVisuals.restoreFallbacks(runtime);
		const cleanupErrors = this.runRenderHookCleanups(runtime);
		const isolationErrors = [...nodeErrors, ...fallbackErrors, ...cleanupErrors];
		const combinedCause = isolationErrors.length === 0
			? cause
			: new AggregateError([cause, ...isolationErrors], "A render hook and its cleanup failed.");
		const error = createInternalError({
			cause: combinedCause,
			code: "render-hook-failed",
			renderHookId: runtime.definition.id,
			hook,
			recoverable: true,
			severity: "warning",
			surface: isRenderHookSurface(surface) ? surface : undefined,
			userMessage: this.messages.renderHookErrorMessage,
			userTitle: this.messages.renderHookErrorTitle
		});
		if (this.isDestroyed) {
			this.deliverError(error);
		} else {
			this.acceptError(error, {
				key: `render-hook-failed:${runtime.definition.id}`,
				politeness: "polite",
				retryable: false
			});
		}
	}

	private handleRenderedGridActionKeydown(
		event: KeyboardEvent,
		dateString: string,
		action: CalendarEventActionElement,
		renderGeneration: number
	): void {
		if (!this.canUseRenderedAction(action, renderGeneration)) {
			return;
		}
		void handleGridActionKeydown(
			event,
			dateString,
			action,
			this.getGridFocusElements(),
			this.host,
			this.dom?.agendaTitle ?? null
		);
	}

	private getGridFocusElements(): Readonly<GridFocusElements> {
		return {
			agendaMoreButton: this.agendaMoreButton,
			dayButtons: this.dayButtons,
			eventActions: this.eventActions,
			gridActionsByDate: this.gridActionsByDate,
			gridMoreButtons: this.gridMoreButtons
		};
	}

	private handleDayKeydown(event: KeyboardEvent, date: CalendarDate, button: HTMLButtonElement): void {
		if (!this.canContinueInteraction() || !this.bounds.isDateAllowed(date)) {
			return;
		}
		if (this.options.onDayContextMenu !== undefined &&
			(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
			event.preventDefault();
			const bounds = button.getBoundingClientRect();
			this.invokeDayContextMenu(event, date, button, bounds.left, bounds.bottom);
			return;
		}

		const offsetInWeek = positiveModulo(toUtcDate(date).getUTCDay() - this.firstDay, DAYS_PER_WEEK);
		const horizontalStep = resolveTextDirection(this.window, this.host) === "rtl" ? -1 : 1;
		let target: CalendarDate | null = null;
		let changesDisplayedMonth = false;
		try {
			switch (event.key) {
				case "ArrowLeft": target = addCalendarDays(date, -horizontalStep); break;
				case "ArrowRight": target = addCalendarDays(date, horizontalStep); break;
				case "ArrowUp": target = addCalendarDays(date, -DAYS_PER_WEEK); break;
				case "ArrowDown": target = addCalendarDays(date, DAYS_PER_WEEK); break;
				case "Home": target = addCalendarDays(date, -offsetInWeek); break;
				case "End": target = addCalendarDays(date, (DAYS_PER_WEEK - 1) - offsetInWeek); break;
				case "PageUp":
					target = addCalendarMonths(date, event.shiftKey ? -12 : -1);
					changesDisplayedMonth = true;
					break;
				case "PageDown":
					target = addCalendarMonths(date, event.shiftKey ? 12 : 1);
					changesDisplayedMonth = true;
					break;
				default: return;
			}
		} catch {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		this.moveFocus(target, changesDisplayedMonth);
	}

	private moveFocus(date: CalendarDate, changesDisplayedMonth: boolean): void {
		const target = changesDisplayedMonth
			? this.bounds.resolveMonthTarget({ day: 1, month: date.month, year: date.year }, date.day)
			: this.bounds.isDateAllowed(date) ? date : null;
		if (target === null ||
			!isRenderableMonth({ day: 1, month: target.month, year: target.year }, this.firstDay)) {
			return;
		}
		const range = getCalendarMonthRange(this.displayedMonth, this.firstDay);
		const isVisible = compareCalendarDates(target, range.start) >= 0 && compareCalendarDates(target, range.end) < 0;
		if (changesDisplayedMonth) {
			const navigationRevision = this.claimNavigation();
			if (navigationRevision === null) {
				return;
			}
			this.monthPickerController.hide(false);
			this.focusedDate = target;
			this.displayedMonth = { day: 1, month: target.month, year: target.year };
			this.selectedDate = target;
			this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
			this.loadVisibleEvents(false);
			if (this.canContinueInteraction() && this.isNavigationCurrent(navigationRevision)) {
				this.dayButtons.get(formatCalendarDate(target))?.focus({ preventScroll: true });
			}
			return;
		}
		if (!isVisible) {
			return;
		}
		this.focusedDate = target;
		for (const candidate of this.dayButtons.values()) {
			candidate.tabIndex = candidate.getAttribute("data-lfc-date") === formatCalendarDate(target) ? 0 : -1;
		}
		this.dayButtons.get(formatCalendarDate(target))?.focus({ preventScroll: true });
	}

	private invokeEventContextMenu(
		nativeEvent: MouseEvent | KeyboardEvent,
		date: CalendarDate,
		element: CalendarEventActionElement,
		event: CalendarEvent<TMetadata>,
		surface: CalendarEventSurface,
		clientX: number,
		clientY: number
	): void {
		const onEventContextMenu = this.options.onEventContextMenu;
		if (onEventContextMenu === undefined) {
			return;
		}
		const context = createEventContextMenu(nativeEvent, date, element, event, surface, clientX, clientY);
		this.invokeAction("onEventContextMenu", () => onEventContextMenu(context));
	}

	private invokeDayContextMenu(
		nativeEvent: MouseEvent | KeyboardEvent,
		date: CalendarDate,
		element: HTMLButtonElement,
		clientX: number,
		clientY: number
	): void {
		if (!this.bounds.isDateAllowed(date)) {
			return;
		}
		const context = createDayContextMenu(nativeEvent, date, element, clientX, clientY);
		const onDayContextMenu = this.options.onDayContextMenu;
		if (onDayContextMenu !== undefined) {
			this.invokeAction("onDayContextMenu", () => onDayContextMenu(context));
		}
	}

	private invokeAction(name: string, action: () => unknown): void {
		if (!this.canContinueInteraction()) {
			return;
		}
		const generation = (this.actionGenerations.get(name) ?? 0) + 1;
		this.actionGenerations.set(name, generation);
		let result: unknown;
		try {
			result = action();
		} catch (cause: unknown) {
			this.handleActionFailure(name, cause, generation);
			return;
		}
		if (result === undefined) {
			if (this.isCurrentAction(name, generation)) {
				this.clearActionIssue(name);
			}
			return;
		}
		void Promise.resolve(result).then(
			() => {
				if (this.isCurrentAction(name, generation)) {
					this.clearActionIssue(name);
				}
			},
			(cause: unknown) => {
				this.handleActionFailure(name, cause, generation);
			}
		);
	}

	private clearActionIssue(name: string): void {
		this.clearIssues((entry) => entry.key === `action-failed:${name}`, true);
	}

	private isCurrentAction(name: string, generation: number): boolean { return !this.isDestroyed && !this.hasFatalError && this.actionGenerations.get(name) === generation; }

	private handleActionFailure(name: string, cause: unknown, generation: number): void {
		const stale = !this.isCurrentAction(name, generation);
		const error = createInternalError({
			cause,
			code: "action-failed",
			hook: name,
			recoverable: true,
			severity: "error",
			stale,
			userMessage: this.messages.actionErrorMessage,
			userTitle: this.messages.actionErrorTitle
		});
		if (stale) {
			this.deliverError(error);
			return;
		}
		this.acceptError(error, {
			key: `action-failed:${name}`,
			politeness: "assertive",
			retryable: false
		}, true, "default", () => this.isCurrentAction(name, generation));
	}

	private selectDate(
		date: CalendarDate,
		invalidHook: string,
		animateSelection = false,
		navigationRevision?: number, moveFocus = true
	): void {
		this.assertNavigableDate(date, invalidHook);
		if (!this.canContinueInteraction()) {
			return;
		}
		const changesMonth = date.year * 12 + date.month !== this.displayedMonth.year * 12 + this.displayedMonth.month;
		const changesSelection = compareCalendarDates(date, this.selectedDate) !== 0;
		const stateBeforeNavigation = this.state;
		const generationBeforeNavigation = this.generation;
		const claimedNavigationRevision = this.claimNavigation(navigationRevision);
		if (claimedNavigationRevision === null) {
			return;
		}
		this.swipeGesture.clear();
		this.monthPickerController.hide(false);
		this.selectionEntryDate = animateSelection && changesSelection && !changesMonth
			? formatCalendarDate(date)
			: null;
		this.selectedDate = date;
		this.focusedDate = date;
		this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
		if (changesMonth) {
			this.displayedMonth = { day: 1, month: date.month, year: date.year };
			this.loadVisibleEvents(false);
		} else {
			this.renderCalendar();
		}
		if (!this.canCompleteNavigation(claimedNavigationRevision)) {
			return;
		}
		if (moveFocus) {
			this.dayButtons.get(formatCalendarDate(date))?.focus({ preventScroll: true });
		}
		if (!this.canCompleteNavigation(claimedNavigationRevision)) {
			return;
		}
		if (!changesMonth && changesSelection) {
			this.setState(this.derivePhase());
		} else if (navigationRevision === undefined &&
			!changesMonth &&
			this.state === stateBeforeNavigation &&
			this.generation === generationBeforeNavigation) {
			this.registeredExtensions?.notifyStateChanged();
		}
	}

	private shiftMonth(
		amount: -1 | 1,
		fromPager = false,
		navigationRevision?: number
	): boolean {
		if (!fromPager) {
			this.swipeGesture.clear();
		}
		try {
			const targetMonth = addCalendarMonths({
				day: 1,
				month: this.displayedMonth.month,
				year: this.displayedMonth.year
			}, amount);
			const target = this.bounds.resolveMonthTarget(targetMonth, this.selectedDate.day);
			if (target === null) {
				return false;
			}
			const dom = this.dom;
			const renderGeneration = this.renderGeneration;
			this.showDate(target, amount < 0 ? "prev" : "next", true, navigationRevision);
			return this.canContinueInteraction() &&
				this.dom === dom &&
				this.renderGeneration > renderGeneration &&
				this.displayedMonth.year === target.year &&
				this.displayedMonth.month === target.month;
		} catch {
			//Navigation stops at the supported calendar boundary.
			return false;
		}
	}

	private navigateToToday(moveFocus: boolean, navigationRevision?: number): void {
		const today = this.getTodayDate();
		if (today === null ||
			!this.bounds.isDateAllowed(today) ||
			!isRenderableMonth({ day: 1, month: today.month, year: today.year }, this.firstDay)) {
			return;
		}
		if (moveFocus) {
			this.selectDate(today, "focusToday", false, navigationRevision);
		} else {
			this.showDate(today, "today", false, navigationRevision);
		}
	}

	private showDate(
		date: CalendarDate,
		invalidHook: string,
		preservePagerTransaction = false,
		navigationRevision?: number
	): void {
		this.assertNavigableDate(date, invalidHook);
		if (!this.canContinueInteraction()) {
			return;
		}
		const changesMonth = date.year !== this.displayedMonth.year || date.month !== this.displayedMonth.month;
		if (!changesMonth) {
			if (compareCalendarDates(date, this.selectedDate) === 0) {
				if (this.claimNavigation(navigationRevision) === null) {
					return;
				}
				this.swipeGesture.clear();
				this.monthPickerController.hide(false);
				if (navigationRevision === undefined) {
					this.registeredExtensions?.notifyStateChanged();
				}
				return;
			}
			this.selectDate(date, invalidHook, false, navigationRevision, false);
			return;
		}
		const claimedNavigationRevision = this.claimNavigation(navigationRevision);
		if (claimedNavigationRevision === null) {
			return;
		}
		if (!preservePagerTransaction) {
			this.swipeGesture.clear();
		}
		this.monthPickerController.hide(false);
		this.displayedMonth = { day: 1, month: date.month, year: date.year };
		this.selectedDate = date;
		this.focusedDate = date;
		this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
		this.loadVisibleEvents(false);
	}

	private assertNavigableDate(date: CalendarDate, invalidHook: string): void {
		const failure = this.bounds.getDateNavigationFailure(date);
		if (failure !== null) {
			throw this.createPublicMethodError("invalid-argument", invalidHook, failure === "out-of-bounds"
				? `${invalidHook}(date) must fall within minDate and maxDate.` : `${invalidHook}(date) cannot display a month whose complete six-week grid falls outside years 0001-9999.`);
		}
	}

	private loadVisibleEvents(userRetry: boolean): void {
		const request = this.beginVisibleEventRequest(userRetry);
		if (request === null) {
			return;
		}
		let result: ReturnType<typeof requestCalendarEvents<TMetadata>>;
		try {
			result = requestCalendarEvents(
				this.eventSource,
				Object.freeze({ ...request.bounds, signal: request.controller.signal }),
				this.sourceEventLimit,
				this.eventBaseUrl
			);
		} catch (cause: unknown) {
			this.handleSourceRequestFailure(cause, request);
			return;
		}
		if (result.timing === "synchronous") {
			if (this.canApplyRequest(request.generation, request.controller)) {
				this.commitSourceRequestSuccess(result.events, request);
			}
			return;
		}

		observeVisibleEventRequest(result.events,
			(values) => { this.commitSourceRequestSuccess(values, request); },
			(cause) => { this.handleSourceRequestFailure(cause, request); },
			(cause) => { this.handleFatalError(cause); });
		this.publishSourceLoading(request);
	}

	private beginVisibleEventRequest(userRetry: boolean): VisibleEventRequest | null {
		if (!this.isRendered || this.isDestroyed || this.dom === null) {
			return null;
		}
		const range = getCalendarMonthRange(this.displayedMonth, this.firstDay);
		const bounds = Object.freeze({
			end: formatCalendarDate(range.end),
			start: formatCalendarDate(range.start)
		});
		const rangeKey = `${bounds.start}/${bounds.end}`;
		const hasRetainedSnapshot = this.loadedRangeKey === rangeKey && this.hasCurrentSnapshot;
		const generation = ++this.generation;
		const previousController = this.activeController;
		this.activeController = null;
		previousController?.abort();
		if (!this.canPrepareRequest(generation)) {
			return null;
		}
		const controller = new this.abortControllerConstructor();
		if (!this.canPrepareRequest(generation)) {
			controller.abort();
			return null;
		}
		this.activeController = controller;
		this.currentRange = bounds;
		this.isRetrying = userRetry;
		if (!hasRetainedSnapshot) {
			this.currentEventsByDate = new Map();
			this.hasCurrentSnapshot = false;
			this.loadedRangeKey = null;
			this.removeIssues(isSourceIssue);
		}
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
		if (!this.canApplyRequest(generation, controller)) {
			return null;
		}
		return Object.freeze({
			bounds,
			controller,
			generation,
			hasRetainedSnapshot,
			rangeKey,
			userRetry
		});
	}

	private publishSourceLoading(request: Readonly<VisibleEventRequest>): void {
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		const dom = this.getDomAfterCallback();
		if (dom === null) {
			return;
		}
		if (!setVisibleEventBusyState(this.host, dom.grid, true, () => this.canApplyRequest(request.generation, request.controller))) {
			return;
		}
		this.setState("loading");
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		if (!this.renderCalendar()) {
			return;
		}
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
	}

	private commitSourceRequestSuccess(
		events: readonly Readonly<NormalizedCalendarEvent<TMetadata>>[],
		request: Readonly<VisibleEventRequest>
	): void {
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		const retryHadFocus = this.dom?.retryButton === this.document.activeElement;
		const removed = this.removeIssues(isSourceIssue);
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		this.currentEventsByDate = indexCalendarEventsByDate(
			events,
			getCalendarMonthRange(this.displayedMonth, this.firstDay).days
		);
		this.hasCurrentSnapshot = true;
		this.loadedRangeKey = request.rangeKey;
		if (!this.commitSourceReadyState(request)) {
			return;
		}
		if (!this.renderCalendar() ||
			!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		if (request.userRetry && removed.some((entry) => !entry.handled)) {
			this.announce({ message: this.messages.recovered, politeness: "polite" });
			if (!this.canApplyRequest(request.generation, request.controller)) {
				return;
			}
		}
		if (!this.isDestroyed && !this.hasFatalError && retryHadFocus) {
			(this.dayButtons.get(formatCalendarDate(this.selectedDate)) ?? this.dom?.titleButton)?.focus({
				preventScroll: true
			});
		}
	}

	private commitSourceReadyState(request: Readonly<VisibleEventRequest>): boolean {
		this.activeController = null;
		this.isRetrying = false;
		if (!setVisibleEventBusyState(this.host, this.dom?.grid ?? null, false,
			() => this.canApplyRequest(request.generation, request.controller))) {
			return false;
		}
		this.setState(this.internalIssues.length > 0 ? "degraded" : "ready");
		return this.canApplyRequest(request.generation, request.controller);
	}

	private handleSourceRequestFailure(
		cause: unknown,
		request: Readonly<VisibleEventRequest>
	): void {
		if (isAbortError(cause) && request.controller.signal.aborted) {
			return;
		}
		if (!this.canApplyRequest(request.generation, request.controller)) {
			this.deliverError(this.createSourceError(cause, request.hasRetainedSnapshot, request.bounds, true));
			return;
		}
		this.activeController = null;
		this.isRetrying = false;
		if (!setVisibleEventBusyState(this.host, this.dom?.grid ?? null, false, () => this.canApplyRequest(request.generation, request.controller))) {
			return;
		}
		const error = this.createSourceError(cause, request.hasRetainedSnapshot, request.bounds, false);
		this.acceptError(error, {
			key: "event-source",
			politeness: request.hasRetainedSnapshot ? "polite" : "assertive",
			retryable: true
		});
		if (!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		if (!this.renderCalendar() ||
			!this.canApplyRequest(request.generation, request.controller)) {
			return;
		}
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
	}

	private canApplyRequest(generation: number, controller: AbortController): boolean { return !this.isDestroyed && generation === this.generation && !controller.signal.aborted; }

	private canPrepareRequest(generation: number): boolean { return this.isRendered && !this.isDestroyed && this.dom !== null && generation === this.generation; }

	private getDomAfterCallback(): CalendarDom | null { return this.dom; }

	private isCallbackGenerationCurrent(generation: number): boolean { return !this.isDestroyed && this.generation === generation; }

	private canContinueInteraction(): boolean { return this.isRendered && !this.isDestroyed && !this.hasFatalError; }

	private wasRenderInterrupted(dom: CalendarDom, renderGeneration: number): boolean { return this.isDestroyed || this.dom !== dom || this.renderGeneration !== renderGeneration; }

	private isRenderGenerationCurrent(renderGeneration: number): boolean { return !this.isDestroyed && this.renderGeneration === renderGeneration; }

	private canUseRenderedAction(element: HTMLElement, renderGeneration: number): boolean { return this.canContinueInteraction() && this.renderGeneration === renderGeneration && element.isConnected && this.host.contains(element) && HOST_OWNERS.get(this.host) === this; }

	private wasRuntimeDestroyed(): boolean { return this.isDestroyed; }

	private wasRenderHookQuarantined(runtime: RenderHookRuntime<TMetadata>): boolean { return runtime.quarantined; }

	private createSourceError(
		cause: unknown,
		retained: boolean,
		range: CalendarRangeBounds,
		stale: boolean
	): LitefoldCalendarError {
		return createInternalError(createEventSourceErrorOptions({ cause, messages: this.messages, range, retained, stale }));
	}

	private readonly handleRetry = (): void => {
		if (!this.canContinueInteraction() ||
			this.isRetrying || this.activeController !== null) {
			return;
		}
		this.isRetrying = true;
		this.renderIssues();
		this.loadVisibleEvents(true);
	};

	private acceptError(
		error: LitefoldCalendarError,
		presentation: {
			readonly key: string;
			readonly politeness: CalendarAnnouncement["politeness"];
			readonly retryable: boolean;
		},
		notifyState = true,
		announcementMode: "default" | "internal" | "none" = "default",
		isCurrent: () => boolean = () => true
	): void {
		const generation = this.generation;
		const handled = this.deliverError(error);
		if (!this.isCallbackGenerationCurrent(generation) || !isCurrent()) {
			return;
		}
		const entry: InternalIssue = Object.freeze({
			handled,
			issue: toCalendarIssue(error),
			key: presentation.key,
			politeness: presentation.politeness,
			retryable: presentation.retryable
		});
		this.resetInternalAnnouncementForIssues(
			this.internalIssues.filter((candidate) => candidate.key === presentation.key)
		);
		this.internalIssues = Object.freeze([
			...this.internalIssues.filter((candidate) => candidate.key !== presentation.key),
			entry
		].slice(-ISSUE_LIMIT));
		if (notifyState) {
			this.setState(this.derivePhase());
		} else {
			this.state = createState(
				this.derivePhase(),
				this.currentRange,
				this.internalIssues.map((candidate) => candidate.issue),
				this.displayedMonth,
				this.selectedDate
			);
		}
		if (!this.isCallbackGenerationCurrent(generation) || !isCurrent()) {
			return;
		}
		this.renderIssues();
		if (!handled) {
			const announcement = {
				message: `${error.userTitle}. ${error.userMessage}`,
				politeness: presentation.politeness
			} as const;
			if (announcementMode === "default") {
				this.announce(announcement);
			} else if (announcementMode === "internal") {
				this.announceInternally(announcement);
			}
		}
	}

	private deliverError(error: LitefoldCalendarError): boolean {
		const handler = this.options.onError;
		if (handler === undefined) {
			reportCalendarError(error);
			return false;
		}
		try {
			const result = (handler as (value: LitefoldCalendarError) => unknown)(error);
			if (result === "handled") {
				return true;
			}
			if (observeThenable(result, (cause) => {
				reportCalendarError(new AggregateError(
					[error, cause],
					"The calendar error handler rejected after returning a thenable."
				));
			}, () => {
				reportCalendarError(new AggregateError(
					[error, new TypeError("onError must return synchronously.")],
					"The calendar error handler returned an unsupported thenable."
				));
			})) {
				return false;
			}
			return false;
		} catch (handlerFailure: unknown) {
			reportCalendarError(new AggregateError(
				[error, handlerFailure],
				"The calendar error handler failed while observing a calendar error."
			));
			return false;
		}
	}

	private renderIssues(): void {
		const dom = this.dom;
		if (dom === null || this.isDestroyed) {
			return;
		}
		const visible = [...this.internalIssues]
			.filter((entry) => !entry.handled)
			.sort((left, right) => severityRank(right.issue.severity) - severityRank(left.issue.severity))[0];
		presentCalendarIssue(dom, {
			issue: visible?.issue ?? null,
			retryable: visible?.retryable ?? false,
			retrying: this.isRetrying,
			retryingText: this.messages.retrying,
			retryText: this.messages.retry
		});
	}

	private announce(announcement: CalendarAnnouncement): void {
		const announcer = this.options.onAnnounce;
		if (announcer !== undefined) {
			try {
				const result = invokeForUnknownResult(announcer, [Object.freeze({ ...announcement })]);
				if (observeThenable(result, (cause) => {
					this.reportLateHostIntegrationFailure("onAnnounce", cause);
				})) {
					throw new TypeError("onAnnounce must return void synchronously.");
				}
				this.resetInternalAnnouncement();
				this.clearIssues((entry) => entry.key === "host-integration:onAnnounce", true);
				return;
			} catch (cause: unknown) {
				this.recordHostIntegrationFailure("onAnnounce", cause, false, "none");
			}
		}
		this.announceInternally(announcement);
	}

	private announceInternally(announcement: CalendarAnnouncement): void {
		const dom = this.dom;
		const presenter = this.announcementPresenter;
		if (dom === null || presenter === null || this.isDestroyed) {
			return;
		}
		const announcementUpdate = presenter.prepare(announcement);
		if (announcementUpdate === null) {
			return;
		}
		const generation = ++this.announcementGeneration;
		const update = (): void => {
			if (generation !== this.announcementGeneration || this.isDestroyed ||
				this.dom !== dom || this.announcementPresenter !== presenter) {
				return;
			}
			announcementUpdate();
		};
		try {
			queueMicrotask(update);
		} catch (cause: unknown) {
			update();
			this.reportLateHostIntegrationFailure("announce-scheduler", cause);
		}
	}

	private resetInternalAnnouncement(): void {
		this.announcementGeneration += 1;
		this.announcementPresenter?.clear();
	}

	private resetInternalAnnouncementForIssues(issues: readonly InternalIssue[]): void {
		if (issues.some((entry) => !entry.handled)) {
			this.resetInternalAnnouncement();
		}
	}

	private clearIssues(
		predicate: (entry: InternalIssue) => boolean,
		render: boolean
	): readonly InternalIssue[] {
		const removed = this.removeIssues(predicate);
		if (removed.length === 0) {
			return removed;
		}
		this.setState(this.derivePhase());
		if (render) {
			this.renderIssues();
		}
		return removed;
	}

	private removeIssues(
		predicate: (entry: InternalIssue) => boolean
	): readonly InternalIssue[] {
		const removed = this.internalIssues.filter(predicate);
		if (removed.length === 0) {
			return removed;
		}
		this.internalIssues = Object.freeze(this.internalIssues.filter((entry) => !predicate(entry)));
		this.resetInternalAnnouncementForIssues(removed);
		return removed;
	}

	private derivePhase(): CalendarPhase {
		if (this.isDestroyed) {
			return "destroyed";
		}
		if (this.hasFatalError) {
			return "unavailable";
		}
		if (this.activeController !== null) {
			return "loading";
		}
		if (!this.hasCurrentSnapshot && this.internalIssues.some((entry) => isSourceIssue(entry))) {
			return "unavailable";
		}
		if (this.internalIssues.length > 0) {
			return "degraded";
		}
		return this.hasCurrentSnapshot ? "ready" : "idle";
	}

	private setState(phase: CalendarPhase): void {
		const callback = this.options.onStateChange;
		if (callback !== undefined && this.internalIssues.some((entry) =>
			entry.key === "host-integration:onStateChange")) {
			const removed = this.internalIssues.filter((entry) =>
				entry.key === "host-integration:onStateChange");
			this.internalIssues = Object.freeze(this.internalIssues.filter((entry) =>
				entry.key !== "host-integration:onStateChange"));
			this.resetInternalAnnouncementForIssues(removed);
			phase = this.derivePhase();
		}
		this.state = createState(
			phase,
			this.currentRange,
			this.internalIssues.map((entry) => entry.issue),
			this.displayedMonth,
			this.selectedDate
		);
		if (callback === undefined) {
			this.registeredExtensions?.notifyStateChanged();
			return;
		}
		try {
			const result = invokeForUnknownResult(callback, [this.state]);
			if (observeThenable(result, (cause) => {
				this.reportLateHostIntegrationFailure("onStateChange", cause);
			})) {
				throw new TypeError("onStateChange must return void synchronously.");
			}
		} catch (cause: unknown) {
			this.recordHostIntegrationFailure("onStateChange", cause, false, "default");
		}
		this.registeredExtensions?.notifyStateChanged();
	}

	private recordHostIntegrationFailure(
		hook: string,
		cause: unknown,
		notifyState: boolean,
		announcementMode: "default" | "internal" | "none"
	): void {
		const error = createInternalError({
			cause,
			code: "host-integration-failed",
			hook,
			recoverable: true,
			severity: "warning",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.acceptError(error, {
			key: `host-integration:${hook}`,
			politeness: "polite",
			retryable: false
		}, notifyState, announcementMode);
	}

	private reportLateHostIntegrationFailure(hook: string, cause: unknown): void {
		const error = createInternalError({
			cause,
			code: "host-integration-failed",
			hook,
			recoverable: true,
			severity: "warning",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.deliverError(error);
	}

	private reportRegisteredExtensionFailure(
		extensionId: string,
		hook: string,
		cause: unknown
	): void {
		const error = createInternalError({
			cause,
			code: "extension-failed",
			extensionId,
			hook,
			message: `Extension ${extensionId} failed during ${hook}.`,
			phase: "integration",
			recoverable: true,
			severity: "warning",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.deliverError(error);
	}

	private handleFatalError(cause: unknown, focusWasRemoved = false): void {
		if (this.isDestroyed) {
			return;
		}
		if (this.hasFatalError) {
			this.deliverError(createInternalError({
				cause,
				code: "internal-error",
				recoverable: false,
				severity: "fatal",
				userMessage: this.messages.internalErrorMessage,
				userTitle: this.messages.internalErrorTitle
			}));
			return;
		}
		this.hasFatalError = true;
		const fatalGeneration = ++this.generation;
		const fatalFocus = this.stopForFatalError(fatalGeneration);
		if (fatalFocus === null || !this.releaseFatalRenderHooks(fatalGeneration)) {
			return;
		}
		const [activeBeforeFallback, focusWasInPicker] = fatalFocus;
		if (this.dom === null) {
			try {
				this.dom = this.createStructure();
			} catch (fallbackFailure: unknown) {
				if (!this.isFatalGenerationCurrent(fatalGeneration)) { return; }
				this.state = createState("unavailable", this.currentRange, [], this.displayedMonth, this.selectedDate);
				reportCalendarError(new AggregateError(
					[cause, fallbackFailure],
					"The calendar and its unavailable fallback both failed to render."
				));
				this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
				return;
			}
			if (!this.isFatalGenerationCurrent(fatalGeneration)) { return; }
		}
		focusWasRemoved = focusWasRemoved || focusWasInPicker ||
			wasOwnedFocusRemoved(activeBeforeFallback, this.host);
		const error = createInternalError({
			cause,
			code: "internal-error",
			recoverable: false,
			severity: "fatal",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.acceptError(error, {
			key: "internal-error",
			politeness: "assertive",
			retryable: false
		});
		if (!this.isFatalGenerationCurrent(fatalGeneration)) {
			return;
		}
		const dom = this.dom;
		this.monthPickerController.hide(false);
		if (!this.isFatalGenerationCurrent(fatalGeneration)) { return; }
		dom.navigation.hidden = true;
		dom.titleButton.setAttribute("aria-disabled", "true");
		dom.grid.hidden = true;
		dom.agenda.hidden = true;
		dom.panel.setAttribute("data-lfc-unavailable", "true");
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
		if (!this.isFatalGenerationCurrent(fatalGeneration)) { return; }
		dom.panelTitle.tabIndex = -1;
		if (focusWasRemoved) {
			(dom.panel.hasAttribute("hidden") ? dom.titleButton : dom.panelTitle).focus({ preventScroll: true });
		}
	}

	private stopForFatalError(generation: number): readonly [Element | null, boolean] | null {
		this.registeredExtensions?.stop();
		if (!this.isFatalGenerationCurrent(generation)) { return null; }
		this.actionGenerations.clear();
		const activeBeforeFallback = getOwnedActiveElement(this.document, this.host);
		const focusWasInPicker = activeBeforeFallback !== null &&
			this.dom?.monthPicker.contains(activeBeforeFallback) === true;
		this.activeController?.abort();
		if (!this.isFatalGenerationCurrent(generation)) { return null; }
		this.activeController = null;
		const ownsHost = HOST_OWNERS.get(this.host) === this;
		this.swipeGesture.clear(ownsHost);
		if (!this.isFatalGenerationCurrent(generation)) { return null; }
		this.swipeGesture.disconnect(ownsHost);
		if (!this.isFatalGenerationCurrent(generation)) { return null; }
		if (ownsHost) {
			this.host.removeAttribute("data-lfc-swipe-enabled");
			if (!this.isFatalGenerationCurrent(generation)) { return null; }
		}
		if (!setVisibleEventBusyState(this.host, this.dom?.grid ?? null, false,
			() => this.isFatalGenerationCurrent(generation))) {
			return null;
		}
		return [activeBeforeFallback, focusWasInPicker];
	}

	private releaseFatalRenderHooks(generation: number): boolean {
		for (const runtime of this.renderHooks) {
			runtime.controller.abort();
			if (!this.isFatalGenerationCurrent(generation)) { return false; }
			const cleanupErrors = this.runRenderHookCleanups(runtime);
			if (!this.isFatalGenerationCurrent(generation)) { return false; }
			cleanupErrors.push(...releaseLeasedNodes(runtime.nodes, runtime.leaseToken));
			if (!this.isFatalGenerationCurrent(generation)) { return false; }
			cleanupErrors.push(...this.renderHookVisuals.clearFallbackTracking(runtime));
			if (!this.isFatalGenerationCurrent(generation)) { return false; }
			if (cleanupErrors.length > 0) {
				this.reportRenderHookCleanupErrors(runtime, cleanupErrors, false);
				if (!this.isFatalGenerationCurrent(generation)) { return false; }
			}
		}
		return this.isFatalGenerationCurrent(generation);
	}

	private isFatalGenerationCurrent(generation: number): boolean { return !this.isDestroyed && this.hasFatalError && this.generation === generation; }

	private createPublicMethodError(
		code: "invalid-argument" | "invalid-state",
		hook: string,
		message: string,
		cause?: unknown
	): LitefoldCalendarError {
		return createStatePublicMethodError(code, hook, message, this.messages, !this.isDestroyed && !this.hasFatalError, cause);
	}

	private requireLive(hook: string): void {
		if (!this.canContinueInteraction()) {
			throw this.createPublicMethodError(
				"invalid-state",
				hook,
				`${hook}() requires a rendered calendar that has not been destroyed and is not unavailable.`
			);
		}
	}

	private resolveConfiguredBound(
		value: CalendarDateInput | undefined,
		name: "maxDate" | "minDate"
	): Readonly<CalendarDate> | undefined {
		if (value === undefined) {
			return undefined;
		}
		const date = this.projectDateInput(value);
		if (date === null) {
			throw createConfigurationError(`${name} must be a valid supported civil date or Date.`);
		}
		return Object.freeze({ ...date });
	}

	private updateNavigationAvailability(dom: CalendarDom, today: CalendarDate | null): void {
		const previousTarget = this.bounds.resolveShiftTarget(
			this.displayedMonth,
			this.selectedDate.day,
			-1
		);
		const nextTarget = this.bounds.resolveShiftTarget(
			this.displayedMonth,
			this.selectedDate.day,
			1
		);
		this.setControlAvailability(
			dom.previousButton,
			previousTarget !== null
		);
		this.setControlAvailability(
			dom.nextButton,
			nextTarget !== null
		);
		this.setPagingLane(dom.previousLane, dom.previousLaneLabelFull, dom.previousLaneLabelCompact, previousTarget);
		this.setPagingLane(dom.nextLane, dom.nextLaneLabelFull, dom.nextLaneLabelCompact, nextTarget);
		this.setControlAvailability(
			dom.todayButton,
			today !== null && this.bounds.isDateAllowed(today) &&
				isRenderableMonth({ day: 1, month: today.month, year: today.year }, this.firstDay)
		);
	}

	private setControlAvailability(button: HTMLButtonElement, available: boolean): void {
		if (available) {
			button.removeAttribute("aria-disabled");
		} else {
			button.setAttribute("aria-disabled", "true");
		}
	}

	private setPagingLane(
		lane: HTMLElement,
		fullLabel: HTMLElement,
		compactLabel: HTMLElement,
		target: CalendarDate | null
	): void {
		if (!this.swipeEnabled || target === null) {
			lane.removeAttribute("data-lfc-page-available");
			fullLabel.textContent = "";
			compactLabel.textContent = "";
			return;
		}
		lane.setAttribute("data-lfc-page-available", "");
		const month = { day: 1, month: target.month, year: target.year };
		fullLabel.textContent = this.monthTitleRenderer.formatFull(month);
		compactLabel.textContent = this.monthTitleRenderer.formatCompact(month);
	}

	private getTodayDateForConstruction(): CalendarDate {
		let instant: unknown;
		try {
			instant = invokeForUnknownResult(this.now, []);
		} catch (cause: unknown) {
			throw createConfigurationError("now threw while the initial date was resolved.", cause);
		}
		const projected = this.projectDateInstant(instant);
		if (projected === null) {
			throw createConfigurationError("now must return a valid Date that can be projected.");
		}
		return projected;
	}

	private getTodayDate(reportFailure = true): CalendarDate | null {
		try {
			const result = this.projectDateInstant(invokeForUnknownResult(this.now, []));
			if (result === null) {
				throw new TypeError("now must return a valid Date that can be projected.");
			}
			return result;
		} catch (cause: unknown) {
			if (reportFailure) {
				this.handleFatalError(cause);
				return null;
			}
			throw cause;
		}
	}

	private projectDateInput(value: unknown): CalendarDate | null {
		if (isDateInstance(value)) {
			return this.projectDateInstant(value);
		}
		return parseCalendarDate(value as CalendarDateInput);
	}

	private projectDateInstant(value: unknown): CalendarDate | null {
		const localDate = parseCalendarDate(value as Date);
		if (localDate === null) {
			return null;
		}
		return this.timeZone === null
			? localDate
			: getCalendarDateForTimeZone(value as Date, this.timeZone);
	}

	private reportRenderHookCleanupErrors(
		runtime: RenderHookRuntime<TMetadata>,
		causes: readonly unknown[],
		present: boolean
	): void {
		const error = createInternalError({
			cause: causes.length === 1 ? causes[0] : new AggregateError(causes),
			code: "render-hook-failed",
			renderHookId: runtime.definition.id,
			hook: "cleanup",
			recoverable: false,
			severity: "warning",
			userMessage: this.messages.renderHookErrorMessage,
			userTitle: this.messages.renderHookErrorTitle
		});
		if (present) {
			this.acceptError(error, {
				key: `render-hook-failed:${runtime.definition.id}`,
				politeness: "polite",
				retryable: false
			});
		} else {
			this.deliverError(error);
		}
	}

	private reportLateRenderHookFailure(
		runtime: RenderHookRuntime<TMetadata>,
		hook: string,
		cause: unknown,
		surface: unknown
	): void {
		const error = createInternalError({
			cause,
			code: "render-hook-failed",
			renderHookId: runtime.definition.id,
			hook,
			recoverable: false,
			severity: "warning",
			surface: isRenderHookSurface(surface) ? surface : undefined,
			userMessage: this.messages.renderHookErrorMessage,
			userTitle: this.messages.renderHookErrorTitle
		});
		this.deliverError(error);
	}
}

/**
 * Creates a consistently configured, dependency-free month calendar.
 *
 * Construction validates and snapshots configuration but does not modify the
 * host. Call {@link Calendar.render} to claim the host and render the calendar.
 *
 * @param host - The HTML element that will contain the rendered calendar. For the supported
 * design contract, its border box must provide at least 320 CSS pixels of inline size;
 * narrower hosts receive best-effort graceful degradation.
 * @param options - Events, localization, callbacks, limits, and render hooks.
 * @returns A calendar instance with explicit render and destroy lifecycle methods.
 * @throws {LitefoldCalendarError} When the host or configuration is invalid.
 */
export function createCalendar<TMetadata = unknown>(
	host: HTMLElement,
	options: CalendarOptions<TMetadata>
): Calendar<TMetadata> {
	return new MonthCalendar<TMetadata>(host, options);
}
