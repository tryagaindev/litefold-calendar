import type { CalendarDom } from "../dom/structure.js";

/** A completed DOM commit owned by one accepted calendar interaction. */
export interface CalendarRenderCompletion {
	readonly dateString: string;
	readonly dom: CalendarDom;
	readonly interactionEpoch: number;
	readonly renderGeneration: number;
}
