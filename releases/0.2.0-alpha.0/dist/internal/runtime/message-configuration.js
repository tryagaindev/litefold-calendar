import { DEFAULT_CALENDAR_MESSAGES } from "../../messages.js";
import { assertKnownConfigurationKeys, createConfigurationError, isConfigurationRecord, readConfigurationValue } from "./configuration.js";
const CALENDAR_MESSAGE_TOKENS = Object.freeze({
    actionErrorMessage: [],
    actionErrorTitle: [],
    agendaEmpty: [],
    agendaMore: ["count"],
    agendaProgress: ["total", "visible"],
    agendaTitle: ["date"],
    allDay: [],
    cancel: [],
    chooseMonthYear: ["date"],
    dayLabel: ["count", "date", "eventLabel"],
    event: [],
    events: [],
    extensionErrorMessage: [],
    extensionErrorTitle: [],
    gridMore: ["count"],
    gridEventInstructions: [],
    gridMoreLabel: ["count", "date", "eventLabel"],
    internalErrorMessage: [],
    internalErrorTitle: [],
    jump: [],
    jumpToMonthYear: [],
    loadErrorMessage: [],
    loadErrorTitle: [],
    month: [],
    navigation: [],
    next: [],
    previous: [],
    recovered: [],
    refreshErrorMessage: [],
    refreshErrorTitle: [],
    retry: [],
    retrying: [],
    today: [],
    year: []
});
const CALENDAR_MESSAGE_KEYS = Object.freeze(Object.keys(CALENDAR_MESSAGE_TOKENS));
const CALENDAR_MESSAGE_KEY_SET = new Set(CALENDAR_MESSAGE_KEYS);
/** Resolves a partial message set over the immutable English defaults. */
export function resolveCalendarMessages(messages) {
    if (messages !== undefined && !isConfigurationRecord(messages)) {
        throw createConfigurationError("messages must be an object when supplied.");
    }
    if (messages !== undefined) {
        assertKnownConfigurationKeys(messages, CALENDAR_MESSAGE_KEY_SET, "messages");
    }
    const resolved = { ...DEFAULT_CALENDAR_MESSAGES };
    for (const key of CALENDAR_MESSAGE_KEYS) {
        const value = messages === undefined
            ? undefined
            : readConfigurationValue(messages, key, `messages.${key}`);
        if (value === undefined) {
            continue;
        }
        if (typeof value !== "string" || value.trim().length === 0) {
            throw createConfigurationError(`messages.${key} must be a non-empty string.`);
        }
        validateCalendarMessageTokens(key, value);
        resolved[key] = value;
    }
    return Object.freeze(resolved);
}
function validateCalendarMessageTokens(key, template) {
    const supportedTokens = CALENDAR_MESSAGE_TOKENS[key];
    for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
        const token = match[1];
        if (token !== undefined && !supportedTokens.includes(token)) {
            throw createConfigurationError(`messages.${key} contains unsupported template token "{${token}}".`);
        }
    }
}
//# sourceMappingURL=message-configuration.js.map