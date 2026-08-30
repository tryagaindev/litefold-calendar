import { normalizeCalendarEvents } from "../domain/event-normalization.js";
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
/** Invokes and normalizes one source result without changing its synchronous or asynchronous timing. */
export function requestCalendarEvents(events, range, maximum, baseUrl) {
    const result = typeof events === "function"
        ? invokeCalendarEventSource(events, range)
        : events;
    let isArray;
    try {
        isArray = Array.isArray(result);
    }
    catch {
        return Object.freeze({
            events: normalizeCalendarEvents(result, maximum, baseUrl),
            timing: "synchronous"
        });
    }
    if (isArray) {
        return Object.freeze({
            events: normalizeCalendarEvents(result, maximum, baseUrl),
            timing: "synchronous"
        });
    }
    const then = readThen(result);
    if (then === null) {
        return Object.freeze({
            events: normalizeCalendarEvents(result, maximum, baseUrl),
            timing: "synchronous"
        });
    }
    const pending = observeSourceThenable(result, then).then((values) => normalizeCalendarEvents(values, maximum, baseUrl));
    return Object.freeze({ events: pending, timing: "asynchronous" });
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
function invokeCalendarEventSource(source, range) {
    return Reflect.apply(source, undefined, [range]);
}
function readThen(value) {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return null;
    }
    const then = Reflect.get(value, "then");
    return typeof then === "function"
        ? then
        : null;
}
function observeSourceThenable(value, then) {
    return new Promise((resolve, reject) => {
        try {
            Reflect.apply(then, value, [resolve, reject]);
        }
        catch (cause) {
            //eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Preserve arbitrary source rejection values as the public error cause.
            reject(cause);
        }
    });
}
//# sourceMappingURL=source.js.map