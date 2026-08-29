import { createConfigurationError, readConfigurationValue, snapshotConfigurationArray } from "./configuration.js";
import { isLitefoldCalendarError, isRecord } from "./safety.js";
const EVENT_INPUT_KEYS = Object.freeze([
    "accentColor",
    "end",
    "id",
    "metadata",
    "start",
    "title",
    "url"
]);
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
        const events = snapshotConfigurationArray(value, "events", true);
        return Object.freeze(events.map((event, index) => snapshotStaticEvent(event, `events[${index.toString()}]`)));
    }
    catch (cause) {
        if (isLitefoldCalendarError(cause)) {
            throw cause;
        }
        throw createConfigurationError("events array could not be snapshotted.", cause);
    }
}
/** Snapshots supported event fields while preserving opaque metadata by reference. */
function snapshotStaticEvent(value, path) {
    if (!isRecord(value)) {
        return value;
    }
    const snapshot = {};
    for (const key of EVENT_INPUT_KEYS) {
        const field = readConfigurationValue(value, key, `${path}.${key}`);
        if (field !== undefined) {
            snapshot[key] = field;
        }
    }
    return Object.freeze(snapshot);
}
//# sourceMappingURL=source.js.map