import type { CalendarDom } from "../dom/structure.js";

/** A completed DOM commit and the interaction that initiated its render. */
export interface CalendarRenderCompletion {
	readonly dateString: string;
	readonly dom: CalendarDom;
	readonly interactionEpoch: number;
	readonly renderGeneration: number;
}
