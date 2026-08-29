import type {
	CalendarDate,
	CalendarExtension,
	CalendarState
} from "../../types.js";

/** Internal protocol implemented atomically by the core package and its first-party extensions. */
export const REGISTERED_EXTENSION_PROTOCOL_VERSION = 1;

/** Private discovery key shared only by package-owned core and extension entry points. */
export const REGISTERED_EXTENSION_INTERFACE = Symbol("litefold-calendar.extension");

/** Capabilities that the core can selectively expose to a registered extension. */
export type RegisteredExtensionCapability =
	| "document"
	| "navigation"
	| "presentationEvents"
	| "state";

/** A presentation-safe event projection available to extensions that request it. */
export interface RegisteredExtensionPresentationEvent {
	readonly end: string | null;
	readonly isAllDay: boolean;
	readonly start: string;
	readonly title: string;
}

/** One bounded page of presentation-safe events. */
export interface RegisteredExtensionPresentationEventPage {
	readonly events: readonly Readonly<RegisteredExtensionPresentationEvent>[];
	/** Monotonic identity of the event snapshot used to produce this page. */
	readonly snapshotRevision: number;
	readonly totalEvents: number;
}

/** Semantic navigation targets available to extensions. */
export type RegisteredExtensionNavigationTarget =
	| Readonly<{ readonly date: Readonly<CalendarDate>; readonly target: "date" }>
	| Readonly<{ readonly target: "next-month" | "previous-month" | "today" }>;

/** Result of one synchronously committed extension navigation. */
export interface RegisteredExtensionNavigationCommit {
	readonly changed: boolean;
	readonly generation: number;
	readonly navigationRevision: number;
	readonly startedLoad: boolean;
}

/** State capability exposed only when requested by a definition. */
export interface RegisteredExtensionStateCapability {
	readonly getGeneration: (this: void) => number;
	readonly getNavigationRevision: (this: void) => number;
	readonly getState: (this: void) => Readonly<CalendarState>;
	readonly hasCurrentSnapshot: (this: void) => boolean;
}

/** Presentation-event capability exposed only when requested by a definition. */
export interface RegisteredExtensionPresentationEventsCapability {
	readonly getPage: (
		this: void,
		date: Readonly<CalendarDate> | null,
		offset: number,
		limit: number
	) => Readonly<RegisteredExtensionPresentationEventPage>;
}

/** Navigation capability exposed only when requested by a definition. */
export interface RegisteredExtensionNavigationCapability {
	readonly navigate: (
		this: void,
		target: RegisteredExtensionNavigationTarget
	) => Readonly<RegisteredExtensionNavigationCommit>;
}

/** Exact, capability-filtered context supplied to one extension activation. */
export interface RegisteredExtensionActivationContext {
	readonly document?: Document;
	readonly fail: (this: void, cause: unknown, hook?: string) => void;
	readonly isLive: (this: void) => boolean;
	readonly navigation?: Readonly<RegisteredExtensionNavigationCapability>;
	readonly presentationEvents?: Readonly<RegisteredExtensionPresentationEventsCapability>;
	readonly signal: AbortSignal;
	readonly state?: Readonly<RegisteredExtensionStateCapability>;
}

/** Synchronous lifecycle hooks returned by an activated extension. */
export interface RegisteredExtensionInstance {
	readonly dispose?: (this: void) => void;
	readonly stateChanged?: (this: void) => void;
}

/** Package-private definition carried by a configured extension value. */
export interface RegisteredExtensionDefinition {
	readonly activate: (
		this: void,
		context: Readonly<RegisteredExtensionActivationContext>
	) => void | Readonly<RegisteredExtensionInstance>;
	readonly capabilities: readonly RegisteredExtensionCapability[];
	readonly id: string;
}

interface RegisteredExtensionInterface {
	readonly definition: Readonly<RegisteredExtensionDefinition>;
	readonly protocolVersion: number;
}

const EXTENSION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CAPABILITIES: ReadonlySet<RegisteredExtensionCapability> = new Set([
	"document",
	"navigation",
	"presentationEvents",
	"state"
]);
const ISSUED_EXTENSIONS = new WeakMap<object, Readonly<RegisteredExtensionInterface>>();

/** Creates one immutable, reusable extension value for an official extension factory. */
export function createRegisteredExtension(
	definition: Readonly<RegisteredExtensionDefinition>
): CalendarExtension {
	if (!EXTENSION_ID_PATTERN.test(definition.id)) {
		throw new TypeError("A registered extension ID must use lowercase kebab-case.");
	}
	if (typeof definition.activate !== "function") {
		throw new TypeError("A registered extension must provide an activation function.");
	}
	const capabilities = Object.freeze([...definition.capabilities]);
	const seenCapabilities = new Set<RegisteredExtensionCapability>();
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
	const extension = Object.create(null) as object;
	Object.defineProperty(extension, REGISTERED_EXTENSION_INTERFACE, {
		configurable: false,
		enumerable: false,
		value: extensionInterface,
		writable: false
	});
	Object.freeze(extension);
	ISSUED_EXTENSIONS.set(extension, extensionInterface);
	return extension as CalendarExtension;
}

/** Discovers and authenticates the internal interface carried by an extension value. */
export function resolveRegisteredExtension(
	value: unknown
): Readonly<RegisteredExtensionDefinition> | null {
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
