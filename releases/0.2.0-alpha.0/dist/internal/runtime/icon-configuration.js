import { DEFAULT_CALENDAR_ICONS } from "../../icons.js";
import { assertKnownConfigurationKeys, createConfigurationError, isConfigurationRecord, readConfigurationValue } from "./configuration.js";
const CALENDAR_ICON_SCHEMA = Object.freeze({
    next: true,
    previous: true
});
const CALENDAR_ICON_KEY_SET = new Set(Object.keys(CALENDAR_ICON_SCHEMA));
/** Resolves a partial icon set over the dependency-free defaults. */
export function resolveCalendarIcons(icons) {
    if (icons === undefined) {
        return DEFAULT_CALENDAR_ICONS;
    }
    if (!isConfigurationRecord(icons)) {
        throw createConfigurationError("icons must be an object when supplied.");
    }
    assertKnownConfigurationKeys(icons, CALENDAR_ICON_KEY_SET, "icons");
    const resolved = {
        next: DEFAULT_CALENDAR_ICONS.next,
        previous: DEFAULT_CALENDAR_ICONS.previous
    };
    for (const direction of ["next", "previous"]) {
        const value = readConfigurationValue(icons, direction, `icons.${direction}`);
        if (value === undefined) {
            continue;
        }
        if (typeof value !== "function") {
            throw createConfigurationError(`icons.${direction} must be a factory function.`);
        }
        resolved[direction] = value;
    }
    return Object.freeze(resolved);
}
//# sourceMappingURL=icon-configuration.js.map