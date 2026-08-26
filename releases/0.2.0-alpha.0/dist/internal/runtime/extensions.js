import { assertKnownConfigurationKeys, createConfigurationError, isConfigurationRecord, readConfigurationValue, snapshotConfigurationArray } from "./configuration.js";
const EXTENSION_SCHEMA = Object.freeze({
    dayDidMount: "hook",
    eventDidMount: "hook",
    id: "id",
    renderDayBadge: "hook",
    renderEventDetails: "hook",
    renderEventLeading: "hook",
    renderEventMarker: "hook",
    renderEventTrailing: "hook"
});
const EXTENSION_HOOK_NAMES = Object.freeze(Object.keys(EXTENSION_SCHEMA).filter((key) => key !== "id"));
const EXTENSION_KEY_SET = new Set(["id", ...EXTENSION_HOOK_NAMES]);
/** Validates extension definitions and creates their coordinator-owned runtime records. */
export function createExtensionRuntimes(extensions, AbortControllerConstructor) {
    if (extensions === undefined) {
        return Object.freeze([]);
    }
    const extensionValues = extensions;
    let isArray;
    try {
        isArray = Array.isArray(extensionValues);
    }
    catch (cause) {
        throw createConfigurationError("extensions could not be inspected.", cause);
    }
    if (!isArray) {
        throw createConfigurationError("extensions must be an array.");
    }
    const extensionSnapshot = snapshotConfigurationArray(extensionValues, "extensions", false);
    const identifiers = new Set();
    let markerRendererId = null;
    const runtimes = extensionSnapshot.map((extension, index) => {
        const extensionValue = extension;
        if (!isConfigurationRecord(extensionValue)) {
            throw createConfigurationError(`Extension at index ${index.toString()} must have a non-empty id.`);
        }
        const path = `extensions[${index.toString()}]`;
        assertKnownConfigurationKeys(extensionValue, EXTENSION_KEY_SET, path);
        const identifier = readConfigurationValue(extensionValue, "id", `${path}.id`);
        if (typeof identifier !== "string" || identifier.trim().length === 0) {
            throw createConfigurationError(`Extension at index ${index.toString()} must have a non-empty id.`);
        }
        if (identifiers.has(identifier)) {
            throw createConfigurationError(`Extension id "${identifier}" is duplicated.`);
        }
        const definition = { id: identifier };
        for (const hookName of EXTENSION_HOOK_NAMES) {
            const hook = readConfigurationValue(extensionValue, hookName, `${path}.${hookName}`);
            if (hook !== undefined && typeof hook !== "function") {
                throw createConfigurationError(`Extension "${identifier}" has an invalid ${hookName} hook.`);
            }
            if (hook !== undefined) {
                definition[hookName] = hook;
            }
        }
        if (definition["renderEventMarker"] !== undefined) {
            if (markerRendererId !== null) {
                throw createConfigurationError(`Extensions "${markerRendererId}" and "${identifier}" both define renderEventMarker.`);
            }
            markerRendererId = identifier;
        }
        identifiers.add(identifier);
        const frozenDefinition = Object.freeze(definition);
        const createController = () => new AbortControllerConstructor();
        return {
            cleanups: [],
            controller: createController(),
            createController,
            definition: frozenDefinition,
            leaseToken: {},
            markerFallbacks: new Map(),
            nodes: new Map(),
            quarantined: false
        };
    });
    return Object.freeze(runtimes);
}
//# sourceMappingURL=extensions.js.map