import type { CalendarEventInput, CalendarEventSource, CalendarOptions } from "../../types.js";
import {
	createConfigurationError,
	readConfigurationValue,
	snapshotConfigurationArray
} from "./configuration.js";
import { isLitefoldCalendarError } from "./safety.js";

/** Resolves a static source snapshot or provider from validated calendar options. */
export function resolveCalendarEvents<TMetadata>(
	options: Record<PropertyKey, unknown>
): CalendarOptions<TMetadata>["events"] {
	const value = readConfigurationValue(options, "events", "events");

	let isArray: boolean;
	try {
		isArray = Array.isArray(value);
	} catch (cause: unknown) {
		throw createConfigurationError("events could not be inspected.", cause);
	}
	if (!isArray) {
		if (typeof value !== "function") {
			throw createConfigurationError("events must be an array or function.");
		}
		return value as CalendarEventSource<TMetadata>;
	}

	try {
		return snapshotConfigurationArray(
			value as readonly CalendarEventInput<TMetadata>[],
			"events",
			true
		) as readonly CalendarEventInput<TMetadata>[];
	} catch (cause: unknown) {
		if (isLitefoldCalendarError(cause)) {
			throw cause;
		}
		throw createConfigurationError("events array could not be snapshotted.", cause);
	}
}
