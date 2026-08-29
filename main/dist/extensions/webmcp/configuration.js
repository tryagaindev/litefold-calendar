import { LitefoldCalendarError } from "../../errors.js";
const DEFAULT_TOOL_NAME_PREFIX = "litefold-calendar";
const MAX_TOOL_NAME_PREFIX_LENGTH = 117;
const TOOL_NAME_PREFIX_PATTERN = /^[A-Za-z0-9_.-]+$/u;
const OPTION_KEYS = new Set(["toolNamePrefix"]);
/** Validates and snapshots WebMCP configuration without consulting browser globals. */
export function normalizeCalendarWebMcpOptions(options) {
    if (options === undefined) {
        return Object.freeze({ toolNamePrefix: DEFAULT_TOOL_NAME_PREFIX });
    }
    if (typeof options !== "object" || options === null || isArray(options)) {
        throw createConfigurationError("webMcp options must be an object.");
    }
    let keys;
    try {
        keys = Reflect.ownKeys(options);
    }
    catch (cause) {
        throw createConfigurationError("webMcp options could not be inspected.", cause);
    }
    const unknownKey = keys.find((key) => typeof key === "string" && !OPTION_KEYS.has(key));
    if (typeof unknownKey === "string") {
        throw createConfigurationError(`webMcp options.${unknownKey} is not a supported option.`);
    }
    let configuredPrefix;
    try {
        configuredPrefix = Reflect.get(options, "toolNamePrefix");
    }
    catch (cause) {
        throw createConfigurationError("webMcp options.toolNamePrefix could not be read.", cause);
    }
    const toolNamePrefix = configuredPrefix === undefined
        ? DEFAULT_TOOL_NAME_PREFIX
        : configuredPrefix;
    if (typeof toolNamePrefix !== "string" || toolNamePrefix.length < 1 ||
        toolNamePrefix.length > MAX_TOOL_NAME_PREFIX_LENGTH ||
        !TOOL_NAME_PREFIX_PATTERN.test(toolNamePrefix)) {
        throw createConfigurationError("webMcp options.toolNamePrefix must contain 1 through 117 ASCII letters, digits, periods, underscores, or hyphens.");
    }
    return Object.freeze({ toolNamePrefix });
}
function createConfigurationError(message, cause) {
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
function isArray(value) {
    try {
        return Array.isArray(value);
    }
    catch {
        return true;
    }
}
//# sourceMappingURL=configuration.js.map