import type { CalendarEventActionElement } from "../../types.js";
import type { EventRepresentationElements } from "../dom/event-representation.js";

interface GridOverflowActionListenerOptions {
	readonly action: HTMLButtonElement;
	readonly isCurrent: () => boolean;
	readonly onActivate: () => void;
	readonly onKeydown: (event: KeyboardEvent) => void;
}

/** Installs package-owned overflow behavior before consumer visual hooks inspect the action. */
export function installGridOverflowActionListeners(
	options: Readonly<GridOverflowActionListenerOptions>
): void {
	options.action.addEventListener("click", () => {
		if (options.isCurrent()) {
			options.onActivate();
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
