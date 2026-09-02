/** Internal protocol implemented atomically by the core package and its first-party extensions. */
export const REGISTERED_EXTENSION_PROTOCOL_VERSION = 1;
/** Private discovery key shared only by package-owned core and extension entry points. */
export const REGISTERED_EXTENSION_INTERFACE = Symbol("litefold-calendar.extension");
const EXTENSION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CAPABILITIES = new Set([
    "document",
    "navigation",
    "presentationEvents",
    "state"
]);
const ISSUED_EXTENSIONS = new WeakMap();
/** Creates one immutable, reusable extension value for an official extension factory. */
export function createRegisteredExtension(definition) {
    if (!EXTENSION_ID_PATTERN.test(definition.id)) {
        throw new TypeError("A registered extension ID must use lowercase kebab-case.");
    }
    if (typeof definition.activate !== "function") {
        throw new TypeError("A registered extension must provide an activation function.");
    }
    const capabilities = Object.freeze([...definition.capabilities]);
    const seenCapabilities = new Set();
    for (const capability of capabilities) {
        if (!CAPABILITIES.has(capability) || seenCapabilities.has(capability)) {
            throw new TypeError(`Registered extension ${definition.id} declares an invalid capability.`);
        }
        seenCapabilities.add(capability);
    }
    const frozenDefinition = Object.freeze({
        activate: definition.activate,
        capabilities,
        id: definition.id
    });
    const extensionInterface = Object.freeze({
        definition: frozenDefinition,
        protocolVersion: REGISTERED_EXTENSION_PROTOCOL_VERSION
    });
    const extension = Object.create(null);
    Object.defineProperty(extension, REGISTERED_EXTENSION_INTERFACE, {
        configurable: false,
        enumerable: false,
        value: extensionInterface,
        writable: false
    });
    Object.freeze(extension);
    ISSUED_EXTENSIONS.set(extension, extensionInterface);
    return extension;
}
/** Discovers and authenticates the internal interface carried by an extension value. */
export function resolveRegisteredExtension(value) {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
        return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, REGISTERED_EXTENSION_INTERFACE);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined ||
        descriptor.enumerable === true || descriptor.configurable === true || descriptor.writable === true) {
        return null;
    }
    const issuedInterface = ISSUED_EXTENSIONS.get(value);
    if (issuedInterface === undefined || descriptor.value !== issuedInterface ||
        issuedInterface.protocolVersion !== REGISTERED_EXTENSION_PROTOCOL_VERSION) {
        return null;
    }
    return issuedInterface.definition;
}
//# sourceMappingURL=registered-extension-contract.js.map