import { assertKnownConfigurationKeys, createConfigurationError, isConfigurationRecord, readConfigurationValue, snapshotConfigurationArray } from "./configuration.js";
const RENDER_HOOK_SCHEMA = Object.freeze({
    dayDidMount: "hook",
    eventDidMount: "hook",
    id: "id",
    renderDayBadge: "hook",
    renderEventDetails: "hook",
    renderEventOverflow: "hook",
    renderEventLeading: "hook",
    renderEventMarker: "hook",
    renderEventTrailing: "hook"
});
const RENDER_HOOK_NAMES = Object.freeze(Object.keys(RENDER_HOOK_SCHEMA).filter((key) => key !== "id"));
const RENDER_HOOK_KEY_SET = new Set(["id", ...RENDER_HOOK_NAMES]);
const SINGLETON_RENDER_HOOK_NAMES = Object.freeze([
    "renderEventMarker",
    "renderEventOverflow"
]);
/** Validates consumer-owned render hooks and creates their coordinator-owned runtime records. */
export function createRenderHookRuntimes(renderHooks, AbortControllerConstructor) {
    if (renderHooks === undefined) {
        return Object.freeze([]);
    }
    const renderHookValues = renderHooks;
    let isArray;
    try {
        isArray = Array.isArray(renderHookValues);
    }
    catch (cause) {
        throw createConfigurationError("renderHooks could not be inspected.", cause);
    }
    if (!isArray) {
        throw createConfigurationError("renderHooks must be an array.");
    }
    const renderHookSnapshot = snapshotConfigurationArray(renderHookValues, "renderHooks", false);
    const identifiers = new Set();
    const singletonOwners = new Map();
    const runtimes = renderHookSnapshot.map((renderHooksDefinition, index) => {
        const renderHooksValue = renderHooksDefinition;
        if (!isConfigurationRecord(renderHooksValue)) {
            throw createConfigurationError(`Render hooks at index ${index.toString()} must have a non-empty id.`);
        }
        const path = `renderHooks[${index.toString()}]`;
        assertKnownConfigurationKeys(renderHooksValue, RENDER_HOOK_KEY_SET, path);
        const identifier = readConfigurationValue(renderHooksValue, "id", `${path}.id`);
        if (typeof identifier !== "string" || identifier.trim().length === 0) {
            throw createConfigurationError(`Render hooks at index ${index.toString()} must have a non-empty id.`);
        }
        if (identifiers.has(identifier)) {
            throw createConfigurationError(`Render hook id "${identifier}" is duplicated.`);
        }
        const definition = { id: identifier };
        for (const hookName of RENDER_HOOK_NAMES) {
            const hook = readConfigurationValue(renderHooksValue, hookName, `${path}.${hookName}`);
            if (hook !== undefined && typeof hook !== "function") {
                throw createConfigurationError(`Render hooks "${identifier}" have an invalid ${hookName} hook.`);
            }
            if (hook !== undefined) {
                definition[hookName] = hook;
            }
        }
        for (const hookName of SINGLETON_RENDER_HOOK_NAMES) {
            if (definition[hookName] === undefined) {
                continue;
            }
            const ownerId = singletonOwners.get(hookName);
            if (ownerId !== undefined) {
                throw createConfigurationError(`Render hooks "${ownerId}" and "${identifier}" both define ${hookName}.`);
            }
            singletonOwners.set(hookName, identifier);
        }
        identifiers.add(identifier);
        const frozenDefinition = Object.freeze(definition);
        const createController = () => new AbortControllerConstructor();
        return {
            cleanups: [],
            controller: createController(),
            createController,
            definition: frozenDefinition,
            eventOverflowFallbacks: new Map(),
            leaseToken: {},
            markerFallbacks: new Map(),
            nodeInvocations: new WeakMap(),
            nodes: new Map(),
            quarantined: false
        };
    });
    return Object.freeze(runtimes);
}
//# sourceMappingURL=render-hooks.js.map