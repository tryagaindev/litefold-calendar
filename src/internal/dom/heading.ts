import type { CalendarHeadingLevel } from "../../types.js";

const CHILD_HEADING_LEVELS = {
	1: 2,
	2: 3,
	3: 4,
	4: 5,
	5: 6,
	6: 6
} as const satisfies Record<CalendarHeadingLevel, CalendarHeadingLevel>;

/** Creates a native heading while preserving its validated tag name. */
export function createHeading(document: Document, level: CalendarHeadingLevel): HTMLHeadingElement {
	return document.createElement(`h${level}`);
}

/** Resolves a subordinate heading without exceeding the native h6 level. */
export function getChildHeadingLevel(level: CalendarHeadingLevel): CalendarHeadingLevel {
	return CHILD_HEADING_LEVELS[level];
}
