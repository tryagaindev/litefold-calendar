import {
	DEFAULT_CALENDAR_ICONS,
	type CalendarIconFactory,
	type CalendarIcons
} from "../../icons.js";
import {
	assertKnownConfigurationKeys,
	createConfigurationError,
	isConfigurationRecord,
	readConfigurationValue
} from "./configuration.js";

const CALENDAR_ICON_SCHEMA = Object.freeze({
	next: true,
	previous: true
} as const satisfies Record<keyof CalendarIcons, true>);

const CALENDAR_ICON_KEY_SET: ReadonlySet<string> = new Set(Object.keys(CALENDAR_ICON_SCHEMA));

/** Resolves a partial icon set over the dependency-free defaults. */
export function resolveCalendarIcons(
	icons: Readonly<Partial<CalendarIcons>> | undefined
): Readonly<CalendarIcons> {
	if (icons === undefined) {
		return DEFAULT_CALENDAR_ICONS;
	}
	if (!isConfigurationRecord(icons)) {
		throw createConfigurationError("icons must be an object when supplied.");
	}
	assertKnownConfigurationKeys(icons, CALENDAR_ICON_KEY_SET, "icons");
	const resolved: Record<"next" | "previous", CalendarIconFactory> = {
		next: DEFAULT_CALENDAR_ICONS.next,
		previous: DEFAULT_CALENDAR_ICONS.previous
	};
	for (const direction of ["next", "previous"] as const) {
		const value = readConfigurationValue(icons, direction, `icons.${direction}`);
		if (value === undefined) {
			continue;
		}
		if (typeof value !== "function") {
			throw createConfigurationError(`icons.${direction} must be a factory function.`);
		}
		resolved[direction] = value as CalendarIconFactory;
	}
	return Object.freeze(resolved);
}
