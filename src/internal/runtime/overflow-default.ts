import type {
	CalendarAction, CalendarEventOverflowActivation, CalendarEventOverflowDefaultContext
} from "../../types.js";
import { hasElementFocus } from "../dom/grid-focus.js";
import type { CalendarRenderCompletion } from "./interaction-completion.js";

interface OverflowDefaultOptions<TMetadata> {
	readonly host: HTMLElement;
	readonly isCurrent: (completion: Readonly<CalendarRenderCompletion>) => boolean;
	readonly onDefault: CalendarAction<CalendarEventOverflowDefaultContext<TMetadata>> | undefined;
	readonly invokeAction: (action: () => unknown) => void;
}

/** Focuses only a current committed agenda and reports successful focus synchronously. */
export function completeEventOverflowDefault<TMetadata>(
	completion: Readonly<CalendarRenderCompletion> | null,
	activation: Readonly<CalendarEventOverflowActivation<TMetadata>> | null,
	options: Readonly<OverflowDefaultOptions<TMetadata>>
): void {
	if (completion === null || !options.isCurrent(completion)) { return; }
	const agendaHeading = completion.dom.agendaTitle;
	const isCurrent = (): boolean => options.isCurrent(completion) &&
		completion.dom.agendaTitle === agendaHeading && agendaHeading.isConnected && options.host.contains(agendaHeading);
	if (!isCurrent()) { return; }
	agendaHeading.focus({ preventScroll: true });
	if (!isCurrent() || !hasElementFocus(agendaHeading)) { return; }
	const onDefault = options.onDefault;
	if (onDefault === undefined || activation === null) { return; }
	const { element: triggerElement, ...snapshot } = activation;
	const context = Object.freeze({ ...snapshot, agendaHeading, triggerElement });
	options.invokeAction(() => onDefault(context));
}
