import { formatCalendarMessage, type CalendarMessages } from "../../messages.js";
import type { CalendarDate, CalendarGridEventDisplay } from "../../types.js";
import type { EventRepresentationElements } from "../dom/event-representation.js";
import { createEventOverflowElements } from "../dom/event-overflow.js";

const COMPACT_NUMBER_FORMAT_OPTIONS = Object.freeze({
	compactDisplay: "short",
	maximumFractionDigits: 1,
	notation: "compact",
	useGrouping: false
} as const);

interface EventOverflowPresenterOptions {
	readonly document: Document;
	readonly gridEventLimit: number;
	readonly gridEventDisplay: Readonly<{ compact: CalendarGridEventDisplay; wide: CalendarGridEventDisplay }>;
	readonly locale: string | undefined;
	readonly messages: Readonly<CalendarMessages>;
	readonly numberFormatter: Intl.NumberFormat;
}

interface PrepareDayEventOverflowOptions {
	readonly compactPrimary: Readonly<EventRepresentationElements> | null;
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly eventCount: number;
	readonly fullDateText: string;
	readonly summaries: HTMLDivElement;
}

interface PreparedGridOverflow {
	readonly button: HTMLButtonElement;
	readonly wide: Readonly<PreparedWideEventOverflowVariant> | null;
}

interface PreparedEventOverflowVariantBase {
	readonly content: HTMLElement;
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly display: "overflow" | "count";
	readonly eventCount: number;
	readonly overflowCount: number;
	readonly root: HTMLElement;
	readonly text: string;
	readonly visibleEventCount: number;
}

interface PreparedCompactEventOverflowVariant extends PreparedEventOverflowVariantBase {
	readonly action: HTMLButtonElement | null;
	readonly placementBoundary: HTMLElement | null;
	readonly variant: "compact";
}

interface PreparedWideEventOverflowVariant extends PreparedEventOverflowVariantBase {
	readonly action: HTMLButtonElement;
	readonly variant: "wide";
}

/** Package-owned event-overflow variant ready for consumer render-hook invocation. */
export type PreparedEventOverflowVariant =
	PreparedCompactEventOverflowVariant | PreparedWideEventOverflowVariant;

/** Applicable overflow variants prepared with package-owned compact placement. */
export interface PreparedDayEventOverflow {
	readonly compact: Readonly<PreparedCompactEventOverflowVariant> | null;
	readonly grid: Readonly<PreparedGridOverflow> | null;
}

/** Builds and places package-owned overflow visuals without invoking consumer code. */
export class CalendarEventOverflowPresenter {
	private compactNumberFormatter: Intl.NumberFormat | null = null;
	private readonly options: Readonly<EventOverflowPresenterOptions>;
	private signedCompactNumberFormatter: Intl.NumberFormat | null = null;

	public constructor(options: Readonly<EventOverflowPresenterOptions>) {
		this.options = options;
	}

	/** Prepares and places each applicable variant once so CSS can switch without rerendering. */
	public prepareAndPlace(
		options: Readonly<PrepareDayEventOverflowOptions>
	): Readonly<PreparedDayEventOverflow> {
		const compactCount = this.showsCount("compact", options.eventCount);
		const wideCount = this.showsCount("wide", options.eventCount);
		options.summaries.setAttribute("data-lfc-compact-display", compactCount ? "count" : "events");
		options.summaries.setAttribute("data-lfc-wide-display", wideCount ? "count" : "events");
		options.compactPrimary?.root.classList.add("lfc-is-compact-primary");
		const grid = this.createGridOverflow(options);
		const compactAction = compactCount || options.eventCount > this.options.gridEventLimit
			? grid?.button ?? null : null;
		const compact = this.createCompactOverflow(options, compactAction);
		if (grid !== null && grid.wide !== null) {
			grid.button.append(grid.wide.root);
		}
		grid?.button.classList.toggle("lfc-has-wide-overflow", grid.wide !== null);
		return Object.freeze({ compact, grid });
	}

	private showsCount(variant: "compact" | "wide", eventCount: number): boolean {
		const mode = this.options.gridEventDisplay[variant];
		return eventCount > 0 && (mode === "count" || (mode === "count-when-multiple" && eventCount > 1));
	}

	private createCompactOverflow(
		options: Readonly<PrepareDayEventOverflowOptions>,
		gridAction: HTMLButtonElement | null
	): Readonly<PreparedCompactEventOverflowVariant> | null {
		if (this.showsCount("compact", options.eventCount) && gridAction !== null) {
			const text = this.getCompactNumberFormatter(false).format(options.eventCount);
			const overflow = createEventOverflowElements(this.options.document, "compact", text);
			overflow.root.classList.add("lfc-is-count");
			gridAction.classList.add("lfc-is-compact-primary");
			gridAction.append(overflow.root);
			return Object.freeze({
				action: gridAction,
				content: overflow.content,
				date: options.date,
				dateString: options.dateString,
				display: "count",
				eventCount: options.eventCount,
				overflowCount: options.eventCount,
				placementBoundary: null,
				root: overflow.root,
				text,
				variant: "compact",
				visibleEventCount: 0
			});
		}
		if (options.eventCount <= 1 &&
			(options.eventCount <= this.options.gridEventLimit || options.compactPrimary !== null)) {
			return null;
		}
		const visibleEventCount = options.compactPrimary !== null &&
			options.compactPrimary.marker.childNodes.length > 0 ? 1 : 0;
		const overflowCount = options.eventCount - visibleEventCount;
		const text = visibleEventCount === 0
			? this.getCompactNumberFormatter(false).format(overflowCount)
			: this.getCompactNumberFormatter(true).format(overflowCount);
		const overflow = createEventOverflowElements(this.options.document, "compact", text);
		this.placeCompactOverflow(options, gridAction, overflow.root, visibleEventCount);
		const action = options.compactPrimary === null ? gridAction : null;
		return Object.freeze({
			action,
			content: overflow.content,
			date: options.date,
			dateString: options.dateString,
			display: "overflow",
			eventCount: options.eventCount,
			overflowCount,
			placementBoundary: action === null
				? options.summaries.parentElement ?? options.summaries
				: null,
			root: overflow.root,
			text,
			variant: "compact",
			visibleEventCount
		});
	}

	private createGridOverflow(
		options: Readonly<PrepareDayEventOverflowOptions>
	): Readonly<PreparedGridOverflow> | null {
		const compactCount = this.showsCount("compact", options.eventCount);
		const wideCount = this.showsCount("wide", options.eventCount);
		const hasOverflow = options.eventCount > this.options.gridEventLimit;
		if (!compactCount && !wideCount && !hasOverflow) {
			return null;
		}
		const button = this.options.document.createElement("button");
		button.className = "lfc-calendar-more lfc-calendar-grid-more";
		button.type = "button";
		button.tabIndex = -1;
		button.setAttribute("aria-keyshortcuts", "F2");
		button.setAttribute("data-lfc-date", options.dateString);
		button.classList.toggle("lfc-is-compact-primary", options.compactPrimary === null);
		button.classList.toggle("lfc-is-wide-count-only", wideCount && !compactCount && !hasOverflow);

		const overflowCount = wideCount ? options.eventCount : Math.max(0, options.eventCount - this.options.gridEventLimit);
		const formattedCount = this.options.numberFormatter.format(overflowCount);
		const text = formatCalendarMessage(wideCount ? this.options.messages.gridEventCount : this.options.messages.gridMore, {
			count: formattedCount,
			eventLabel: overflowCount === 1 ? this.options.messages.event : this.options.messages.events
		});
		const wide = createEventOverflowElements(this.options.document, "wide", text);
		wide.root.classList.toggle("lfc-is-count", wideCount);
		const accessibleCount = compactCount || wideCount ? options.eventCount : overflowCount;
		const accessibleLabel = formatCalendarMessage(
			compactCount || wideCount ? this.options.messages.gridEventCountLabel : this.options.messages.gridMoreLabel, {
			count: this.options.numberFormatter.format(accessibleCount),
			date: options.fullDateText,
			eventLabel: accessibleCount === 1
				? this.options.messages.event
				: this.options.messages.events
		});
		button.setAttribute("aria-label", compactCount && !wideCount && hasOverflow
			? `${accessibleLabel}, ${text}` : accessibleLabel);
		return Object.freeze({
			button,
			wide: !wideCount && !hasOverflow ? null : Object.freeze({
				action: button,
				content: wide.content,
				date: options.date,
				dateString: options.dateString,
				display: wideCount ? "count" : "overflow",
				eventCount: options.eventCount,
				overflowCount,
				root: wide.root,
				text,
				variant: "wide",
				visibleEventCount: options.eventCount - overflowCount
			})
		});
	}

	private getCompactNumberFormatter(signed: boolean): Intl.NumberFormat {
		if (signed) {
			if (this.signedCompactNumberFormatter !== null) {
				return this.signedCompactNumberFormatter;
			}
			this.signedCompactNumberFormatter ??= new Intl.NumberFormat(this.options.locale, {
				...COMPACT_NUMBER_FORMAT_OPTIONS,
				signDisplay: "always"
			});
			return this.signedCompactNumberFormatter;
		}
		if (this.compactNumberFormatter !== null) {
			return this.compactNumberFormatter;
		}
		this.compactNumberFormatter ??= new Intl.NumberFormat(
			this.options.locale,
			COMPACT_NUMBER_FORMAT_OPTIONS
		);
		return this.compactNumberFormatter;
	}

	private placeCompactOverflow(
		options: Readonly<PrepareDayEventOverflowOptions>,
		gridAction: HTMLButtonElement | null,
		overflow: HTMLSpanElement,
		visibleEventCount: number
	): void {
		if (options.compactPrimary !== null) {
			const overflowCluster = this.options.document.createElement("div");
			overflowCluster.className = "lfc-calendar-event-overflow-cluster";
			overflowCluster.classList.toggle(
				"lfc-has-compact-primary-visual",
				visibleEventCount === 1
			);
			options.compactPrimary.root.replaceWith(overflowCluster);
			overflowCluster.append(options.compactPrimary.root, overflow);
			return;
		}
		if (gridAction !== null) {
			gridAction.append(overflow);
			return;
		}
		const overflowCluster = this.options.document.createElement("div");
		overflowCluster.className = "lfc-calendar-event-overflow-cluster";
		overflowCluster.append(overflow);
		options.summaries.append(overflowCluster);
	}
}
