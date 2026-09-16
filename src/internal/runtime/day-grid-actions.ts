import type {
	CalendarAction,
	CalendarDate,
	CalendarEvent,
	CalendarEventActionElement,
	CalendarEventOverflowActivation
} from "../../types.js";
import { formatCalendarDate } from "../domain/civil-date.js";
import type { EventRepresentationElements } from "../dom/event-representation.js";
import type { PreparedDayEventOverflow } from "./event-overflow-presentation.js";

/** Advertises day shortcuts that stay available in both container presentations. */
export function setDayActionShortcuts(
	button: HTMLButtonElement,
	hasSummaryAction: boolean,
	overflow: Readonly<PreparedDayEventOverflow>,
	hasContext: boolean
): void {
	const compactHasAction = hasSummaryAction || (overflow.compact?.action ?? null) !== null;
	const wideHasAction = hasSummaryAction || (overflow.grid?.wide ?? null) !== null;
	const hasActionsInBothPresentations = compactHasAction && wideHasAction;
	const shortcuts = [...(hasActionsInBothPresentations ? ["F2"] : []), ...(hasContext ? ["Shift+F10"] : [])];
	if (shortcuts.length > 0) {
		button.setAttribute("aria-keyshortcuts", shortcuts.join(" "));
	}
}

interface GridOverflowActionListenerOptions<TMetadata> {
	readonly action: HTMLButtonElement;
	readonly date: CalendarDate;
	readonly events: () => readonly CalendarEvent<TMetadata>[];
	readonly invokeAction: (action: () => unknown) => void;
	readonly isCurrent: () => boolean;
	readonly onActivate: CalendarAction<CalendarEventOverflowActivation<TMetadata>> | undefined;
	readonly onDefault: () => void;
	readonly onKeydown: (event: KeyboardEvent) => void;
}

/** Installs package-owned overflow behavior before consumer visual hooks inspect the action. */
export function installGridOverflowActionListeners<TMetadata>(
	options: Readonly<GridOverflowActionListenerOptions<TMetadata>>
): void {
	options.action.addEventListener("click", (event) => {
		if (!options.isCurrent()) {
			return;
		}
		const onActivate = options.onActivate;
		if (onActivate !== undefined) {
			const events = Object.freeze([...options.events()]);
			const context = Object.freeze({
				date: Object.freeze({ ...options.date }),
				dateString: formatCalendarDate(options.date),
				element: options.action,
				eventCount: events.length,
				events,
				nativeEvent: event
			});
			options.invokeAction(() => onActivate(context));
		}
		if (!event.defaultPrevented && options.isCurrent()) {
			options.onDefault();
		}
	}, { capture: true });
	options.action.addEventListener("keydown", (event) => {
		options.onKeydown(event);
	}, { capture: true });
}

/** Collects one day's grid actions and selects its first actionable compact representation. */
export class DayGridActionCollector {
	private readonly actions: CalendarEventActionElement[] = [];
	private compactPrimaryValue: Readonly<EventRepresentationElements> | null = null;
	private readonly eventActionRegistry: Map<string, CalendarEventActionElement>;

	public constructor(eventActionRegistry: Map<string, CalendarEventActionElement>) {
		this.eventActionRegistry = eventActionRegistry;
	}

	/** First actionable event representation eligible for compact presentation. */
	public get compactPrimary(): Readonly<EventRepresentationElements> | null {
		return this.compactPrimaryValue;
	}

	/** Registers one actionable event representation in keyboard and activation order. */
	public registerEvent(
		actionKey: string,
		elements: Readonly<EventRepresentationElements>
	): void {
		const { action } = elements;
		if (action === null) {
			return;
		}
		this.actions.push(action);
		this.eventActionRegistry.set(actionKey, action);
		this.compactPrimaryValue ??= elements;
	}

	/** Appends the native day-overflow action after visible event actions. */
	public registerOverflow(action: HTMLButtonElement): void {
		this.actions.push(action);
	}

	/** Returns an immutable focus-order snapshot for the completed day cell. */
	public snapshot(): readonly CalendarEventActionElement[] {
		return Object.freeze([...this.actions]);
	}
}
