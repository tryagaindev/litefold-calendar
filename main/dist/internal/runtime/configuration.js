import { MAX_SOURCE_EVENT_LIMIT } from "../domain/event-normalization.js";
import { resolveCalendarFirstDay } from "../domain/grid.js";
import { LitefoldCalendarError } from "../../errors.js";
import { containsInteractiveContent, invokeForUnknownResult, isAppendableNode, isHTMLElementLike, isRecord, isSameDocumentNode } from "./safety.js";
const CALENDAR_OPTION_SCHEMA = Object.freeze({
    agendaDomLimit: "value",
    agendaPageSize: "value",
    eventTimeDisplay: "value",
    events: "value",
    extensions: "value",
    renderHooks: "value",
    fallbackElement: "value",
    firstDay: "value",
    headingLevel: "value",
    icons: "value",
    initialDate: "value",
    isEventContextMenuAvailable: "callback",
    locale: "value",
    maxDate: "value",
    maxGridEventsPerDay: "value",
    messages: "value",
    minDate: "value",
    now: "callback",
    onAnnounce: "callback",
    onDayContextMenu: "callback",
    onDaySelect: "callback",
    onError: "callback",
    onEventActivate: "callback",
    onEventContextMenu: "callback",
    onStateChange: "callback",
    sourceEventLimit: "value",
    swipe: "value",
    timeZone: "value",
    toolbarEnd: "value"
});
const CALENDAR_OPTION_KEYS = Object.freeze(Object.keys(CALENDAR_OPTION_SCHEMA));
const CALENDAR_OPTION_KEY_SET = new Set(CALENDAR_OPTION_KEYS);
const CONFIGURATION_ARRAY_LIMIT = MAX_SOURCE_EVENT_LIMIT + 1;
export function createConfigurationError(message, cause) {
    return new LitefoldCalendarError({
        ...(cause === undefined ? {} : { cause }),
        code: "invalid-configuration",
        message,
        phase: "configuration",
        recoverable: false,
        severity: "error",
        userMessage: "The calendar configuration is invalid.",
        userTitle: "Calendar unavailable"
    });
}
export function isConfigurationRecord(value) {
    if (!isRecord(value)) {
        return false;
    }
    try {
        return !Array.isArray(value);
    }
    catch {
        return false;
    }
}
export function assertKnownConfigurationKeys(value, allowedKeys, path) {
    let keys;
    try {
        keys = Reflect.ownKeys(value);
    }
    catch (cause) {
        throw createConfigurationError(`${path} could not be inspected.`, cause);
    }
    const unknownKey = keys.find((key) => typeof key === "string" && !allowedKeys.has(key));
    if (typeof unknownKey === "string") {
        throw createConfigurationError(`${path}.${unknownKey} is not a supported option.`);
    }
}
export function readConfigurationValue(value, key, path) {
    try {
        return Reflect.get(value, key);
    }
    catch (cause) {
        throw createConfigurationError(`${path} could not be read.`, cause);
    }
}
export function snapshotConfigurationArray(value, path, truncate) {
    const length = readConfigurationValue(value, "length", `${path}.length`);
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
        throw createConfigurationError(`${path} has an invalid length.`);
    }
    if (!truncate && length > CONFIGURATION_ARRAY_LIMIT) {
        throw createConfigurationError(`${path} must contain at most ${CONFIGURATION_ARRAY_LIMIT.toString()} items.`);
    }
    const snapshot = [];
    const snapshotLength = Math.min(length, CONFIGURATION_ARRAY_LIMIT);
    for (let index = 0; index < snapshotLength; index += 1) {
        snapshot.push(readConfigurationValue(value, index, `${path}[${index.toString()}]`));
    }
    return Object.freeze(snapshot);
}
export function snapshotCalendarOptions(options) {
    if (!isConfigurationRecord(options)) {
        throw createConfigurationError("options must be an object.");
    }
    assertKnownConfigurationKeys(options, CALENDAR_OPTION_KEY_SET, "options");
    const snapshot = {};
    for (const key of CALENDAR_OPTION_KEYS) {
        const value = readConfigurationValue(options, key, `options.${key}`);
        if (value !== undefined || key === "events") {
            snapshot[key] = value;
        }
    }
    for (const key of CALENDAR_OPTION_KEYS.filter((candidate) => CALENDAR_OPTION_SCHEMA[candidate] === "callback")) {
        const value = snapshot[key];
        if (value !== undefined && typeof value !== "function") {
            throw createConfigurationError(`${key} must be a function.`);
        }
    }
    normalizeEventTimeDisplay(snapshot["eventTimeDisplay"]);
    return Object.freeze(snapshot);
}
export function normalizeIntegerOption(value, defaultValue, minimum, maximum, name) {
    if (value === undefined) {
        return defaultValue;
    }
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw createConfigurationError(`${name} must be an integer from ${minimum.toString()} through ${maximum.toString()}.`);
    }
    return value;
}
/** Resolves the surfaces on which event times remain visually displayed. */
export function normalizeEventTimeDisplay(value) {
    if (value === undefined) {
        return "all";
    }
    if (value !== "all" && value !== "grid" && value !== "agenda" && value !== "none") {
        throw createConfigurationError('eventTimeDisplay must be "all", "grid", "agenda", or "none".');
    }
    return value;
}
export function normalizeLocale(locale) {
    if (locale === undefined) {
        return undefined;
    }
    if (typeof locale !== "string" || locale.trim().length === 0) {
        throw createConfigurationError("locale must be a non-empty language tag.");
    }
    try {
        return Intl.getCanonicalLocales(locale)[0];
    }
    catch (cause) {
        throw createConfigurationError("locale must be a valid language tag.", cause);
    }
}
export function normalizeTimeZone(timeZone) {
    if (timeZone === undefined) {
        return null;
    }
    if (typeof timeZone !== "string" || timeZone.trim().length === 0) {
        throw createConfigurationError("timeZone must be a non-empty IANA time-zone identifier.");
    }
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
        return timeZone;
    }
    catch (cause) {
        throw createConfigurationError("timeZone must be a valid IANA time-zone identifier.", cause);
    }
}
export function resolveFirstDay(value, locale) {
    let firstDay = value;
    if (firstDay === undefined) {
        firstDay = "locale";
    }
    if (firstDay !== "locale" && (typeof firstDay !== "number" ||
        !Number.isInteger(firstDay) || firstDay < 0 || firstDay > 6)) {
        throw createConfigurationError("firstDay must be \"locale\" or an integer from 0 through 6.");
    }
    return resolveCalendarFirstDay(firstDay, locale);
}
export function resolveToolbarEnd(document, host, toolbarEnd) {
    if (toolbarEnd === undefined) {
        return null;
    }
    let isValid = false;
    try {
        isValid = isHTMLElementLike(toolbarEnd) && toolbarEnd.ownerDocument === document &&
            toolbarEnd !== host && !toolbarEnd.contains(host) &&
            (toolbarEnd.parentNode === null || host.contains(toolbarEnd));
    }
    catch (cause) {
        throw createConfigurationError("toolbarEnd could not be inspected.", cause);
    }
    if (!isValid) {
        throw createConfigurationError("toolbarEnd must be a detached HTML element or an existing HTML element descendant of the host.");
    }
    return toolbarEnd;
}
/** Resolves same-document progressive fallback content kept outside the calendar host. */
export function resolveFallbackElement(document, host, fallbackElement) {
    if (fallbackElement === undefined) {
        return null;
    }
    let isValid = false;
    try {
        isValid = isHTMLElementLike(fallbackElement) && fallbackElement.ownerDocument === document &&
            fallbackElement !== host && !host.contains(fallbackElement) && !fallbackElement.contains(host);
    }
    catch (cause) {
        throw createConfigurationError("fallbackElement could not be inspected.", cause);
    }
    if (!isValid) {
        throw createConfigurationError("fallbackElement must be a same-document HTML element that neither contains nor is contained by the calendar host.");
    }
    return fallbackElement;
}
/** Preserves the exact-optional fallback option after construction validation. */
export function getFallbackOption(fallbackElement) {
    return fallbackElement === null ? {} : { fallbackElement };
}
export function resolveIconNodes(document, host, icons) {
    const nodes = {};
    for (const direction of ["previous", "next"]) {
        if (typeof icons[direction] !== "function") {
            throw createConfigurationError(`${direction} icon must be a factory function.`);
        }
        let node;
        try {
            node = invokeForUnknownResult(icons[direction], [document]);
        }
        catch (cause) {
            throw createConfigurationError(`${direction} icon factory failed.`, cause);
        }
        let isValid = false;
        try {
            isValid = isSameDocumentNode(document, node) && isAppendableNode(node) &&
                node.parentNode === null && !node.contains(host) && !containsInteractiveContent(node);
        }
        catch (cause) {
            throw createConfigurationError(`${direction} icon factory result could not be inspected.`, cause);
        }
        if (!isValid) {
            throw createConfigurationError(`${direction} icon factory must return detached, noninteractive content owned by the host document.`);
        }
        nodes[direction] = node;
    }
    if (nodes.previous === nodes.next) {
        throw createConfigurationError("Navigation icon factories must return distinct nodes.");
    }
    return Object.freeze(nodes);
}
//# sourceMappingURL=configuration.js.map