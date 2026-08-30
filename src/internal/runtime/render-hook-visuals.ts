import { createEventAccent } from "../dom/event-accent.js";
import type { PreparedEventOverflowVariant } from "./event-overflow-presentation.js";
import {
	assertRenderHookElementIntegrity,
	assertRenderHookElementValueIntegrity,
	captureRenderHookElementIntegrity
} from "./render-hook-element-integrity.js";
import type {
	RenderHookEventOverflowFallback,
	RenderHookRuntime
} from "./render-hooks.js";
import { observeThenable } from "./safety.js";

const CUSTOM_EVENT_OVERFLOW_CLASS = "lfc-has-custom-event-overflow";
const SUPPRESSED_EVENT_OVERFLOW_CLASS = "lfc-is-event-overflow-suppressed";

interface RenderHookVisualRendererOptions<TMetadata> {
	readonly appendNode: (
		runtime: RenderHookRuntime<TMetadata>,
		hookName: string,
		container: HTMLElement,
		result: unknown,
		requirePresentationalContent?: boolean,
		surface?: unknown
	) => boolean;
	readonly document: Document;
	readonly renderHooks: readonly RenderHookRuntime<TMetadata>[];
	readonly isDestroyed: () => boolean;
	readonly isInvocationCurrent: (
		runtime: RenderHookRuntime<TMetadata>,
		controller: AbortController
	) => boolean;
	readonly quarantine: (
		runtime: RenderHookRuntime<TMetadata>,
		hookName: string,
		cause: unknown,
		surface: unknown
	) => void;
	readonly reportLateFailure: (
		runtime: RenderHookRuntime<TMetadata>,
		hookName: string,
		cause: unknown,
		surface: unknown
	) => void;
}

/** Owns singleton visual render-hook invocation and package-default recovery. */
export class RenderHookVisualRenderer<TMetadata> {
	private readonly options: Readonly<RenderHookVisualRendererOptions<TMetadata>>;

	public constructor(options: Readonly<RenderHookVisualRendererOptions<TMetadata>>) {
		this.options = options;
	}

	/** Renders an event marker through its singleton hook or the package default. */
	public renderEventMarker(
		container: HTMLElement,
		accentColor: string | null,
		protectedElements: readonly (HTMLElement | null)[],
		createContext: (signal: AbortSignal) => Readonly<Record<string, unknown>>
	): void {
		if (this.options.isDestroyed()) {
			return;
		}
		const runtime = this.options.renderHooks.find((candidate) =>
			!candidate.quarantined && candidate.definition.renderEventMarker !== undefined);
		if (runtime === undefined) {
			container.append(createEventAccent(this.options.document, accentColor));
			return;
		}
		const hook = runtime.definition.renderEventMarker as ((context: unknown) => unknown) | undefined;
		if (hook === undefined) {
			container.append(createEventAccent(this.options.document, accentColor));
			return;
		}
		const controller = runtime.controller;
		const context = Object.freeze(createContext(controller.signal));
		const surface = context["surface"];
		try {
			const elementIntegrity = captureRenderHookElementIntegrity(protectedElements);
			const result = hook(context);
			const returnedThenable = observeThenable(result, (cause) => {
				this.options.reportLateFailure(runtime, "renderEventMarker", cause, surface);
			});
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				if (returnedThenable) {
					this.options.reportLateFailure(
						runtime,
						"renderEventMarker",
						new TypeError("renderEventMarker must return a node or null synchronously."),
						surface
					);
				}
				return;
			}
			assertRenderHookElementIntegrity(elementIntegrity, "renderEventMarker");
			if (returnedThenable) {
				throw new TypeError("renderEventMarker must return a node or null synchronously.");
			}
			if (result === null) {
				runtime.markerFallbacks.set(container, accentColor);
				return;
			}
			if (result === undefined) {
				throw new TypeError("renderEventMarker must return a node or null.");
			}
			if (!this.options.appendNode(
				runtime,
				"renderEventMarker",
				container,
				result,
				true,
				surface
			)) {
				if (this.canRestoreFallback(container)) {
					container.append(createEventAccent(this.options.document, accentColor));
				}
				return;
			}
			assertRenderHookElementValueIntegrity(elementIntegrity, "renderEventMarker");
			runtime.markerFallbacks.set(container, accentColor);
		} catch (cause: unknown) {
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				this.options.reportLateFailure(runtime, "renderEventMarker", cause, surface);
				return;
			}
			this.options.quarantine(runtime, "renderEventMarker", cause, surface);
			if (this.canRestoreFallback(container)) {
				container.append(createEventAccent(this.options.document, accentColor));
			}
		}
	}

	/** Renders one pre-rendered compact or wide overflow variant through its singleton hook. */
	public renderEventOverflow(options: Readonly<PreparedEventOverflowVariant>): void {
		if (this.options.isDestroyed()) {
			return;
		}
		const runtime = this.options.renderHooks.find((candidate) =>
			!candidate.quarantined && candidate.definition.renderEventOverflow !== undefined);
		if (runtime === undefined) {
			return;
		}
		const hook = runtime.definition.renderEventOverflow as
			((context: unknown) => unknown) | undefined;
		if (hook === undefined) {
			return;
		}
		const controller = runtime.controller;
		const surface = options.variant === "compact" ? "day" as const : "grid-summary" as const;
		const context = Object.freeze({
			date: Object.freeze({ ...options.date }),
			dateString: options.dateString,
			document: this.options.document,
			elements: Object.freeze({
				action: options.action,
				content: options.content,
				root: options.root
			}),
			eventCount: options.eventCount,
			overflowCount: options.overflowCount,
			signal: controller.signal,
			surface,
			text: options.text,
			variant: options.variant,
			visibleEventCount: options.visibleEventCount
		});
		try {
			let fallback = runtime.eventOverflowFallbacks.get(options.content);
			if (fallback === undefined) {
				const packageChildren = Object.freeze([...options.content.childNodes]);
				fallback = Object.freeze({
					content: options.content,
					defaultChildren: Object.freeze(
						packageChildren.map((node) => node.cloneNode(true))
					),
					detachedPackageIntegrity: null,
					packageChildren,
					root: options.root,
					surface
				});
				runtime.eventOverflowFallbacks.set(options.content, fallback);
			}
			const elementIntegrity = captureRenderHookElementIntegrity(
				getEventOverflowProtectedElements(options)
			);
			const packageChildrenIntegrity = captureRenderHookElementIntegrity(
				fallback.packageChildren
			);
			const result = hook(context);
			const returnedThenable = observeThenable(result, (cause) => {
				this.options.reportLateFailure(
					runtime,
					"renderEventOverflow",
					cause,
					surface
				);
			});
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				if (returnedThenable) {
					this.options.reportLateFailure(
						runtime,
						"renderEventOverflow",
						new TypeError(
							"renderEventOverflow must return a node, null, or undefined synchronously."
						),
						surface
					);
				}
				return;
			}
			assertRenderHookElementIntegrity(elementIntegrity, "renderEventOverflow");
			if (returnedThenable) {
				throw new TypeError(
					"renderEventOverflow must return a node, null, or undefined synchronously."
				);
			}
			if (result === undefined) {
				return;
			}
			if (result === null) {
				if (options.variant === "compact" && options.action === null) {
					options.root.classList.add(SUPPRESSED_EVENT_OVERFLOW_CLASS);
					fallback = detachPackageFallbackChildren(fallback);
					runtime.eventOverflowFallbacks.set(options.content, fallback);
				}
				return;
			}
			if (!this.options.appendNode(
				runtime,
				"renderEventOverflow",
				options.content,
				result,
				true,
				surface
			)) {
				return;
			}
			assertRenderHookElementIntegrity(packageChildrenIntegrity, "renderEventOverflow");
			assertRenderHookElementValueIntegrity(elementIntegrity, "renderEventOverflow");
			fallback = detachPackageFallbackChildren(fallback);
			runtime.eventOverflowFallbacks.set(options.content, fallback);
			options.root.classList.add(CUSTOM_EVENT_OVERFLOW_CLASS);
		} catch (cause: unknown) {
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				this.options.reportLateFailure(
					runtime,
					"renderEventOverflow",
					cause,
					surface
				);
				return;
			}
			this.options.quarantine(runtime, "renderEventOverflow", cause, surface);
		}
	}

	/** Clears stale fallback bookkeeping when an ordinary render or teardown releases render-hook nodes. */
	public clearFallbackTracking(runtime: RenderHookRuntime<TMetadata>): unknown[] {
		const errors: unknown[] = [];
		for (const { root } of runtime.eventOverflowFallbacks.values()) {
			try {
				root.classList.remove(
					CUSTOM_EVENT_OVERFLOW_CLASS,
					SUPPRESSED_EVENT_OVERFLOW_CLASS
				);
			} catch (cause: unknown) {
				errors.push(cause);
			}
		}
		runtime.eventOverflowFallbacks.clear();
		runtime.markerFallbacks.clear();
		return errors;
	}

	/** Restores package-owned visual fallbacks after render hooks are quarantined. */
	public restoreFallbacks(runtime: RenderHookRuntime<TMetadata>): unknown[] {
		const errors: unknown[] = [];
		if (!this.options.isDestroyed()) {
			for (const [container, accentColor] of runtime.markerFallbacks) {
				if (container.childNodes.length > 0) {
					continue;
				}
				try {
					container.append(createEventAccent(this.options.document, accentColor));
				} catch (cause: unknown) {
					errors.push(cause);
				}
			}
			for (const fallback of runtime.eventOverflowFallbacks.values()) {
				try {
					fallback.root.classList.remove(
						CUSTOM_EVENT_OVERFLOW_CLASS,
						SUPPRESSED_EVENT_OVERFLOW_CLASS
					);
				} catch (cause: unknown) {
					errors.push(cause);
				}
				try {
					if (!hasEquivalentChildren(fallback.content, fallback.defaultChildren)) {
						fallback.content.replaceChildren(
							...fallback.defaultChildren.map((node) => node.cloneNode(true))
						);
					}
				} catch (cause: unknown) {
					errors.push(cause);
				}
			}
		}
		runtime.eventOverflowFallbacks.clear();
		runtime.markerFallbacks.clear();
		return errors;
	}

	private canRestoreFallback(container: HTMLElement): boolean {
		return !this.options.isDestroyed() && container.childNodes.length === 0;
	}
}

function hasEquivalentChildren(container: HTMLElement, expectedChildren: readonly Node[]): boolean {
	if (container.childNodes.length !== expectedChildren.length) {
		return false;
	}
	return expectedChildren.every((expected, index) =>
		container.childNodes.item(index).isEqualNode(expected));
}

function detachPackageFallbackChildren(
	fallback: Readonly<RenderHookEventOverflowFallback>
): Readonly<RenderHookEventOverflowFallback> {
	for (const child of fallback.packageChildren) {
		if (child.parentNode === fallback.content) {
			fallback.content.removeChild(child);
		}
	}
	return Object.freeze({
		...fallback,
		detachedPackageIntegrity: captureRenderHookElementIntegrity(fallback.packageChildren)
	});
}

function getEventOverflowProtectedElements(
	options: Readonly<PreparedEventOverflowVariant>
): readonly (HTMLElement | null)[] {
	const protectedElements: (HTMLElement | null)[] = [
		options.action,
		options.root,
		options.content
	];
	if (options.variant === "compact" && options.action === null) {
		protectedElements.push(options.placementBoundary);
	}
	return Object.freeze(protectedElements);
}
