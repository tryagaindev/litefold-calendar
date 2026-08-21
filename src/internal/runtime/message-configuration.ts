import {
	DEFAULT_CALENDAR_MESSAGES,
	type CalendarMessages,
	type CalendarMessageValues
} from "../../messages.js";
import {
	assertKnownConfigurationKeys,
	createConfigurationError,
	isConfigurationRecord,
	readConfigurationValue
} from "./configuration.js";

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
} as const satisfies Record<keyof CalendarMessages, readonly (keyof CalendarMessageValues)[]>);

const CALENDAR_MESSAGE_KEYS = Object.freeze(
	Object.keys(CALENDAR_MESSAGE_TOKENS) as readonly (keyof CalendarMessages)[]
);

const CALENDAR_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(CALENDAR_MESSAGE_KEYS);

type MutableCalendarMessages = {
	-readonly [TKey in keyof CalendarMessages]: CalendarMessages[TKey];
};

/** Resolves a partial message set over the immutable English defaults. */
export function resolveCalendarMessages(
	messages: Readonly<Partial<CalendarMessages>> | undefined
): Readonly<CalendarMessages> {
	if (messages !== undefined && !isConfigurationRecord(messages)) {
		throw createConfigurationError("messages must be an object when supplied.");
	}
	if (messages !== undefined) {
		assertKnownConfigurationKeys(messages, CALENDAR_MESSAGE_KEY_SET, "messages");
	}

	const resolved: MutableCalendarMessages = { ...DEFAULT_CALENDAR_MESSAGES };
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

function validateCalendarMessageTokens(key: keyof CalendarMessages, template: string): void {
	const supportedTokens = CALENDAR_MESSAGE_TOKENS[key];
	for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
		const token = match[1];
		if (token !== undefined && !(supportedTokens as readonly string[]).includes(token)) {
			throw createConfigurationError(`messages.${key} contains unsupported template token "{${token}}".`);
		}
	}
}
