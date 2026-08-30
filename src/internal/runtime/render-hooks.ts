import type { CalendarRenderHooks } from "../../types.js";
import type { RenderHookElementIntegritySnapshot } from "./render-hook-element-integrity.js";
import {
	assertKnownConfigurationKeys,
	createConfigurationError,
	isConfigurationRecord,
	readConfigurationValue,
	snapshotConfigurationArray
} from "./configuration.js";

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
} as const satisfies Record<keyof CalendarRenderHooks, "hook" | "id">);

const RENDER_HOOK_NAMES = Object.freeze(
	Object.keys(RENDER_HOOK_SCHEMA).filter((key) => key !== "id") as readonly Exclude<
		keyof CalendarRenderHooks,
		"id"
	>[]
);
const RENDER_HOOK_KEY_SET: ReadonlySet<string> = new Set(["id", ...RENDER_HOOK_NAMES]);
const SINGLETON_RENDER_HOOK_NAMES = Object.freeze([
	"renderEventMarker",
	"renderEventOverflow"
] as const satisfies readonly (keyof CalendarRenderHooks)[]);

/** Identifies the render invocation that owns one leased render-hook node. */
export interface RenderHookNodeInvocation {
	readonly controller: AbortController;
	readonly hookName: string;
	readonly surface: unknown;
}

/** Canonical package-owned overflow content retained for render-hook isolation recovery. */
export interface RenderHookEventOverflowFallback {
	readonly content: HTMLElement;
	readonly defaultChildren: readonly Node[];
	readonly detachedPackageIntegrity: Readonly<RenderHookElementIntegritySnapshot> | null;
	readonly packageChildren: readonly Node[];
	readonly root: HTMLElement;
	readonly surface: "day" | "grid-summary";
}

/** Mutable state for one consumer-owned render-hook set. */
export interface RenderHookRuntime<TMetadata> {
	controller: AbortController;
	readonly createController: () => AbortController;
	readonly definition: CalendarRenderHooks<TMetadata>;
	readonly cleanups: (() => void)[];
	readonly eventOverflowFallbacks: Map<HTMLElement, Readonly<RenderHookEventOverflowFallback>>;
	readonly leaseToken: object;
	readonly markerFallbacks: Map<HTMLElement, string | null>;
	readonly nodeInvocations: WeakMap<Node, Readonly<RenderHookNodeInvocation>>;
	readonly nodes: Map<Node, Node>;
	quarantined: boolean;
}

/** Validates consumer-owned render hooks and creates their coordinator-owned runtime records. */
export function createRenderHookRuntimes<TMetadata>(
	renderHooks: readonly Readonly<CalendarRenderHooks<TMetadata>>[] | undefined,
	AbortControllerConstructor: typeof AbortController
): readonly RenderHookRuntime<TMetadata>[] {
	if (renderHooks === undefined) {
		return Object.freeze([]);
	}
	const renderHookValues: unknown = renderHooks;
	let isArray: boolean;
	try {
		isArray = Array.isArray(renderHookValues);
	} catch (cause: unknown) {
		throw createConfigurationError("renderHooks could not be inspected.", cause);
	}
	if (!isArray) {
		throw createConfigurationError("renderHooks must be an array.");
	}
	const renderHookSnapshot = snapshotConfigurationArray(
		renderHookValues as readonly unknown[],
		"renderHooks",
		false
	);
	const identifiers = new Set<string>();
	const singletonOwners = new Map<keyof CalendarRenderHooks, string>();
	const runtimes = renderHookSnapshot.map((renderHooksDefinition, index) => {
		const renderHooksValue: unknown = renderHooksDefinition;
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
		const definition: Record<PropertyKey, unknown> = { id: identifier };
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
				throw createConfigurationError(
					`Render hooks "${ownerId}" and "${identifier}" both define ${hookName}.`
				);
			}
			singletonOwners.set(hookName, identifier);
		}
		identifiers.add(identifier);
		const frozenDefinition = Object.freeze(definition) as Readonly<CalendarRenderHooks<TMetadata>>;
		const createController = (): AbortController => new AbortControllerConstructor();
		return {
			cleanups: [],
			controller: createController(),
			createController,
			definition: frozenDefinition,
			eventOverflowFallbacks: new Map<HTMLElement, Readonly<RenderHookEventOverflowFallback>>(),
			leaseToken: {},
			markerFallbacks: new Map<HTMLElement, string | null>(),
			nodeInvocations: new WeakMap<Node, Readonly<RenderHookNodeInvocation>>(),
			nodes: new Map<Node, Node>(),
			quarantined: false
		};
	});
	return Object.freeze(runtimes);
}
