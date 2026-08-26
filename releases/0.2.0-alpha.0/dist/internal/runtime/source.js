import { createConfigurationError, readConfigurationValue, snapshotConfigurationArray } from "./configuration.js";
import { isLitefoldCalendarError } from "./safety.js";
/** Resolves a static source snapshot or provider from validated calendar options. */
export function resolveCalendarEvents(options) {
    const value = readConfigurationValue(options, "events", "events");
    let isArray;
    try {
        isArray = Array.isArray(value);
    }
    catch (cause) {
        throw createConfigurationError("events could not be inspected.", cause);
    }
    if (!isArray) {
        if (typeof value !== "function") {
            throw createConfigurationError("events must be an array or function.");
        }
        return value;
    }
    try {
        return snapshotConfigurationArray(value, "events", true);
    }
    catch (cause) {
        if (isLitefoldCalendarError(cause)) {
            throw cause;
        }
        throw createConfigurationError("events array could not be snapshotted.", cause);
    }
}
//# sourceMappingURL=source.js.map