import type { CalendarExtension } from "../../types.js";
import {
	assertKnownConfigurationKeys,
	createConfigurationError,
	isConfigurationRecord,
	readConfigurationValue,
	snapshotConfigurationArray
} from "./configuration.js";

const EXTENSION_SCHEMA = Object.freeze({
	dayDidMount: "hook",
	eventDidMount: "hook",
	id: "id",
	renderDayBadge: "hook",
	renderEventDetails: "hook",
	renderEventLeading: "hook",
	renderEventMarker: "hook",
	renderEventTrailing: "hook",
	renderGridOverflowContent: "hook",
	renderMultipleEventIndicator: "hook"
} as const satisfies Record<keyof CalendarExtension, "hook" | "id">);

const EXTENSION_HOOK_NAMES = Object.freeze(
	Object.keys(EXTENSION_SCHEMA).filter((key) => key !== "id") as readonly Exclude<
		keyof CalendarExtension,
		"id"
	>[]
);
const EXTENSION_KEY_SET: ReadonlySet<string> = new Set(["id", ...EXTENSION_HOOK_NAMES]);
const SINGLETON_EXTENSION_HOOK_NAMES = Object.freeze([
	"renderEventMarker",
	"renderGridOverflowContent",
	"renderMultipleEventIndicator"
] as const satisfies readonly (keyof CalendarExtension)[]);

/** Identifies the render invocation that owns one leased extension node. */
export interface ExtensionNodeInvocation {
	readonly controller: AbortController;
	readonly hookName: string;
}

/** Mutable per-extension state owned and sequenced by the calendar coordinator. */
export interface ExtensionRuntime<TMetadata> {
	controller: AbortController;
	readonly createController: () => AbortController;
	readonly definition: CalendarExtension<TMetadata>;
	readonly cleanups: (() => void)[];
	readonly gridOverflowContentFallbacks: Set<HTMLButtonElement>;
	readonly leaseToken: object;
	readonly markerFallbacks: Map<HTMLElement, string | null>;
	readonly multipleEventIndicatorFallbacks: Set<HTMLElement>;
	readonly nodeInvocations: WeakMap<Node, Readonly<ExtensionNodeInvocation>>;
	readonly nodes: Map<Node, Node>;
	quarantined: boolean;
}

/** Validates extension definitions and creates their coordinator-owned runtime records. */
export function createExtensionRuntimes<TMetadata>(
	extensions: readonly Readonly<CalendarExtension<TMetadata>>[] | undefined,
	AbortControllerConstructor: typeof AbortController
): readonly ExtensionRuntime<TMetadata>[] {
	if (extensions === undefined) {
		return Object.freeze([]);
	}
	const extensionValues: unknown = extensions;
	let isArray: boolean;
	try {
		isArray = Array.isArray(extensionValues);
	} catch (cause: unknown) {
		throw createConfigurationError("extensions could not be inspected.", cause);
	}
	if (!isArray) {
		throw createConfigurationError("extensions must be an array.");
	}
	const extensionSnapshot = snapshotConfigurationArray(
		extensionValues as readonly unknown[],
		"extensions",
		false
	);
	const identifiers = new Set<string>();
	const singletonOwners = new Map<keyof CalendarExtension, string>();
	const runtimes = extensionSnapshot.map((extension, index) => {
		const extensionValue: unknown = extension;
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
		const definition: Record<PropertyKey, unknown> = { id: identifier };
		for (const hookName of EXTENSION_HOOK_NAMES) {
			const hook = readConfigurationValue(extensionValue, hookName, `${path}.${hookName}`);
			if (hook !== undefined && typeof hook !== "function") {
				throw createConfigurationError(`Extension "${identifier}" has an invalid ${hookName} hook.`);
			}
			if (hook !== undefined) {
				definition[hookName] = hook;
			}
		}
		for (const hookName of SINGLETON_EXTENSION_HOOK_NAMES) {
			if (definition[hookName] === undefined) {
				continue;
			}
			const ownerId = singletonOwners.get(hookName);
			if (ownerId !== undefined) {
				throw createConfigurationError(
					`Extensions "${ownerId}" and "${identifier}" both define ${hookName}.`
				);
			}
			singletonOwners.set(hookName, identifier);
		}
		identifiers.add(identifier);
		const frozenDefinition = Object.freeze(definition) as Readonly<CalendarExtension<TMetadata>>;
		const createController = (): AbortController => new AbortControllerConstructor();
		return {
			cleanups: [],
			controller: createController(),
			createController,
			definition: frozenDefinition,
			gridOverflowContentFallbacks: new Set<HTMLButtonElement>(),
			leaseToken: {},
			markerFallbacks: new Map<HTMLElement, string | null>(),
			multipleEventIndicatorFallbacks: new Set<HTMLElement>(),
			nodeInvocations: new WeakMap<Node, Readonly<ExtensionNodeInvocation>>(),
			nodes: new Map<Node, Node>(),
			quarantined: false
		};
	});
	return Object.freeze(runtimes);
}
