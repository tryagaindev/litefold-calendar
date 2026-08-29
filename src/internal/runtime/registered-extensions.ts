import { reportCalendarError } from "../../errors.js";
import type { CalendarExtension } from "../../types.js";
import {
	createConfigurationError,
	snapshotConfigurationArray
} from "./configuration.js";
import {
	resolveRegisteredExtension,
	type RegisteredExtensionActivationContext,
	type RegisteredExtensionDefinition,
	type RegisteredExtensionInstance,
	type RegisteredExtensionNavigationCommit,
	type RegisteredExtensionNavigationTarget,
	type RegisteredExtensionPresentationEventPage
} from "./registered-extension-contract.js";
import { invokeForUnknownResult, observeThenable } from "./safety.js";
import type { CalendarDate, CalendarState } from "../../types.js";

type RegisteredExtensionStatus =
	| "pending"
	| "activating"
	| "active"
	| "quarantined"
	| "stopped";

interface RegisteredExtensionRuntime {
	readonly definition: Readonly<RegisteredExtensionDefinition>;
	controller: AbortController | null;
	dispose: (() => void) | null;
	stateChanged: (() => void) | null;
	status: RegisteredExtensionStatus;
}

/** Core-owned providers from which least-privilege extension contexts are built. */
export interface RegisteredExtensionManagerOptions {
	readonly abortControllerConstructor: typeof AbortController;
	readonly document: Document;
	readonly extensions: readonly CalendarExtension[] | undefined;
	readonly getGeneration: (this: void) => number;
	readonly getNavigationRevision: (this: void) => number;
	readonly getPresentationEventPage: (
		this: void,
		date: Readonly<CalendarDate> | null,
		offset: number,
		limit: number
	) => Readonly<RegisteredExtensionPresentationEventPage>;
	readonly getState: (this: void) => Readonly<CalendarState>;
	readonly hasCurrentSnapshot: (this: void) => boolean;
	readonly isLive: (this: void) => boolean;
	readonly navigate: (
		this: void,
		target: RegisteredExtensionNavigationTarget
	) => Readonly<RegisteredExtensionNavigationCommit>;
	readonly reportFailure: (
		this: void,
		extensionId: string,
		hook: string,
		cause: unknown
	) => void;
}

/** Generic lifecycle host for configured first-party extensions. */
export class RegisteredExtensionManager {
	private isStateNotificationPending = false;
	private isStopped = false;
	private readonly options: Readonly<RegisteredExtensionManagerOptions>;
	private readonly runtimes: readonly RegisteredExtensionRuntime[];
	private stateRevision = 0;

	public constructor(options: Readonly<RegisteredExtensionManagerOptions>) {
		this.options = options;
		this.runtimes = resolveExtensionRuntimes(options.extensions);
	}

	/** Whether this calendar selected at least one extension. */
	public get hasExtensions(): boolean { return this.runtimes.length > 0; }

	/** Activates all pending extensions in registration order. */
	public activate(): void {
		if (!this.canContinue()) {
			return;
		}
		for (const runtime of this.runtimes) {
			if (!this.canContinue()) {
				break;
			}
			if (runtime.status !== "pending") {
				continue;
			}
			this.activateRuntime(runtime);
		}
	}

	/** Schedules coalesced state delivery after the consumer callback completes. */
	public notifyStateChanged(): void {
		this.stateRevision += 1;
		if (this.isStopped || this.isStateNotificationPending ||
			!this.runtimes.some((runtime) => runtime.status === "active" &&
				runtime.stateChanged !== null)) {
			return;
		}
		this.isStateNotificationPending = true;
		const dispatch = (): void => {
			this.isStateNotificationPending = false;
			this.dispatchStateChanged();
		};
		try {
			queueMicrotask(dispatch);
		} catch {
			//A replaced scheduling primitive must not break the calendar's committed state.
			dispatch();
		}
	}

	/** Aborts and disposes every activated extension in reverse registration order. */
	public stop(): void {
		if (this.isStopped) {
			return;
		}
		this.isStopped = true;
		this.stateRevision += 1;
		for (let index = this.runtimes.length - 1; index >= 0; index -= 1) {
			const runtime = this.runtimes[index];
			if (runtime !== undefined) {
				this.stopRuntime(runtime, true);
			}
		}
	}

	private activateRuntime(runtime: RegisteredExtensionRuntime): void {
		runtime.status = "activating";
		const controller = new this.options.abortControllerConstructor();
		runtime.controller = controller;
		let result: unknown;
		try {
			result = invokeForUnknownResult(runtime.definition.activate, [
				this.createActivationContext(runtime, controller)
			]);
		} catch (cause: unknown) {
			this.quarantine(runtime, "activate", cause);
			return;
		}
		if (observeThenable(result, () => undefined)) {
			this.quarantine(
				runtime,
				"activate",
				new TypeError("Extension activation must return synchronously.")
			);
			return;
		}
		let instance: Readonly<RegisteredExtensionInstance> | null;
		try {
			instance = normalizeExtensionInstance(result);
		} catch (cause: unknown) {
			this.quarantine(runtime, "activate", cause);
			return;
		}
		if (!this.isActivationCurrent(runtime, controller)) {
			this.disposeDetached(runtime, instance?.dispose ?? null);
			return;
		}
		runtime.dispose = instance?.dispose ?? null;
		runtime.stateChanged = instance?.stateChanged ?? null;
		runtime.status = "active";
	}

	private createActivationContext(
		runtime: RegisteredExtensionRuntime,
		controller: AbortController
	): Readonly<RegisteredExtensionActivationContext> {
		const context: Record<PropertyKey, unknown> = {
			fail: (cause: unknown, hook = "runtime"): void => {
				this.quarantine(runtime, hook, cause);
			},
			isLive: (): boolean => this.isRuntimeLive(runtime),
			signal: controller.signal
		};
		for (const capability of runtime.definition.capabilities) {
			switch (capability) {
				case "document":
					context["document"] = this.options.document;
					break;
				case "navigation":
					context["navigation"] = Object.freeze({
						navigate: (target: RegisteredExtensionNavigationTarget) => {
							this.requireRuntimeLive(runtime);
							return this.options.navigate(target);
						}
					});
					break;
				case "presentationEvents":
					context["presentationEvents"] = Object.freeze({
						getPage: (date: Readonly<CalendarDate> | null, offset: number, limit: number) => {
							this.requireRuntimeLive(runtime);
							return this.options.getPresentationEventPage(date, offset, limit);
						}
					});
					break;
				case "state":
					context["state"] = Object.freeze({
						getGeneration: () => {
							this.requireRuntimeLive(runtime);
							return this.options.getGeneration();
						},
						getNavigationRevision: () => {
							this.requireRuntimeLive(runtime);
							return this.options.getNavigationRevision();
						},
						getState: () => {
							this.requireRuntimeLive(runtime);
							return this.options.getState();
						},
						hasCurrentSnapshot: () => {
							this.requireRuntimeLive(runtime);
							return this.options.hasCurrentSnapshot();
						}
					});
					break;
			}
		}
		return Object.freeze(context) as Readonly<RegisteredExtensionActivationContext>;
	}

	private dispatchStateChanged(): void {
		if (!this.canContinue()) {
			return;
		}
		const revision = this.stateRevision;
		for (const runtime of this.runtimes) {
			if (!this.isDispatchCurrent(revision)) {
				break;
			}
			const callback = runtime.status === "active" ? runtime.stateChanged : null;
			if (callback === null) {
				continue;
			}
			let result: unknown;
			try {
				result = invokeForUnknownResult(callback, []);
			} catch (cause: unknown) {
				this.quarantine(runtime, "stateChanged", cause);
				continue;
			}
			if (observeThenable(result, () => undefined)) {
				this.quarantine(
					runtime,
					"stateChanged",
					new TypeError("Extension state hooks must return void synchronously.")
				);
			} else if (result !== undefined) {
				this.quarantine(
					runtime,
					"stateChanged",
					new TypeError("Extension state hooks must return void.")
				);
			}
		}
		if (this.shouldRedispatch(revision)) {
			this.notifyStateChangedWithoutRevision();
		}
	}

	private notifyStateChangedWithoutRevision(): void {
		if (this.isStateNotificationPending || this.isStopped ||
			!this.runtimes.some((runtime) => runtime.status === "active" &&
				runtime.stateChanged !== null)) {
			return;
		}
		this.isStateNotificationPending = true;
		const dispatch = (): void => {
			this.isStateNotificationPending = false;
			this.dispatchStateChanged();
		};
		try {
			queueMicrotask(dispatch);
		} catch {
			dispatch();
		}
	}

	private quarantine(runtime: RegisteredExtensionRuntime, hook: string, cause: unknown): void {
		if (runtime.status === "quarantined" || runtime.status === "stopped") {
			return;
		}
		runtime.status = "quarantined";
		const controller = runtime.controller;
		runtime.controller = null;
		const dispose = runtime.dispose;
		runtime.dispose = null;
		runtime.stateChanged = null;
		try {
			controller?.abort();
		} catch (abortFailure: unknown) {
			cause = new AggregateError([cause, abortFailure], "Extension failure and abort both failed.");
		}
		const cleanupFailure = invokeDispose(dispose);
		if (cleanupFailure !== null) {
			cause = new AggregateError([cause, cleanupFailure], "Extension failure and disposal both failed.");
		}
		this.reportFailure(runtime.definition.id, hook, cause);
	}

	private stopRuntime(runtime: RegisteredExtensionRuntime, reportDisposeFailure: boolean): void {
		if (runtime.status === "stopped") {
			return;
		}
		runtime.status = "stopped";
		const controller = runtime.controller;
		runtime.controller = null;
		const dispose = runtime.dispose;
		runtime.dispose = null;
		runtime.stateChanged = null;
		let failure: unknown = null;
		try {
			controller?.abort();
		} catch (cause: unknown) {
			failure = cause;
		}
		const disposeFailure = invokeDispose(dispose);
		if (disposeFailure !== null) {
			failure = failure === null
				? disposeFailure
				: new AggregateError([failure, disposeFailure], "Extension abort and disposal both failed.");
		}
		if (failure !== null && reportDisposeFailure) {
			this.reportFailure(runtime.definition.id, "dispose", failure);
		}
	}

	private disposeDetached(runtime: RegisteredExtensionRuntime, dispose: (() => void) | null): void {
		const failure = invokeDispose(dispose);
		//Quarantine already owns the single diagnostic for this activation.
		if (failure !== null && runtime.status !== "quarantined") {
			this.reportFailure(runtime.definition.id, "dispose", failure);
		}
	}

	private isRuntimeLive(runtime: RegisteredExtensionRuntime): boolean {
		return !this.isStopped && (runtime.status === "activating" || runtime.status === "active") &&
			runtime.controller?.signal.aborted === false && this.options.isLive();
	}

	private canContinue(): boolean {
		return !this.isStopped && this.options.isLive();
	}

	private isActivationCurrent(
		runtime: RegisteredExtensionRuntime,
		controller: AbortController
	): boolean {
		return runtime.status === "activating" && !controller.signal.aborted && this.canContinue();
	}

	private isDispatchCurrent(revision: number): boolean {
		return revision === this.stateRevision && this.canContinue();
	}

	private shouldRedispatch(revision: number): boolean {
		return !this.isStopped && revision !== this.stateRevision;
	}

	private requireRuntimeLive(runtime: RegisteredExtensionRuntime): void {
		if (!this.isRuntimeLive(runtime)) {
			throw new Error(`Extension ${runtime.definition.id} is no longer active.`);
		}
	}

	private reportFailure(runtimeId: string, hook: string, cause: unknown): void {
		try {
			this.options.reportFailure(runtimeId, hook, cause);
		} catch (reportingFailure: unknown) {
			reportCalendarError(new AggregateError(
				[cause, reportingFailure],
				`Extension ${runtimeId} failure could not be reported.`
			));
		}
	}
}

function resolveExtensionRuntimes(
	extensions: readonly CalendarExtension[] | undefined
): readonly RegisteredExtensionRuntime[] {
	if (extensions === undefined) {
		return Object.freeze([]);
	}
	let isArray: boolean;
	try {
		isArray = Array.isArray(extensions);
	} catch (cause: unknown) {
		throw createConfigurationError("extensions could not be inspected.", cause);
	}
	if (!isArray) {
		throw createConfigurationError("extensions must be an array.");
	}
	const snapshot = snapshotConfigurationArray(extensions, "extensions", false);
	const values = new Set<object>();
	const identifiers = new Map<string, number>();
	const runtimes: RegisteredExtensionRuntime[] = [];
	for (const [index, value] of snapshot.entries()) {
		let definition: Readonly<RegisteredExtensionDefinition> | null;
		try {
			definition = resolveRegisteredExtension(value);
		} catch (cause: unknown) {
			throw createConfigurationError(`extensions[${index.toString()}] could not be inspected.`, cause);
		}
		if (definition === null) {
			throw createConfigurationError(
				`extensions[${index.toString()}] is not an extension issued by this package instance.`
			);
		}
		if (values.has(value as object)) {
			throw createConfigurationError(
				`extensions[${index.toString()}] repeats an earlier configured extension value.`
			);
		}
		values.add(value as object);
		const firstIndex = identifiers.get(definition.id);
		if (firstIndex !== undefined) {
			throw createConfigurationError(
				`extensions[${index.toString()}] repeats extension ID ${definition.id} from extensions[${firstIndex.toString()}].`
			);
		}
		identifiers.set(definition.id, index);
		runtimes.push({
			controller: null,
			definition,
			dispose: null,
			stateChanged: null,
			status: "pending"
		});
	}
	return Object.freeze(runtimes);
}

function normalizeExtensionInstance(
	value: unknown
): Readonly<RegisteredExtensionInstance> | null {
	if (value === undefined) {
		return null;
	}
	if ((typeof value !== "object" && typeof value !== "function") || value === null ||
		Array.isArray(value)) {
		throw new TypeError("Extension activation must return void or a lifecycle object.");
	}
	let keys: readonly PropertyKey[];
	try {
		keys = Reflect.ownKeys(value);
	} catch (cause: unknown) {
		throw new TypeError("An extension lifecycle object could not be inspected.", { cause });
	}
	if (keys.some((key) => key !== "dispose" && key !== "stateChanged")) {
		throw new TypeError("An extension lifecycle object contains an unsupported hook.");
	}
	let dispose: unknown;
	let stateChanged: unknown;
	try {
		dispose = Reflect.get(value, "dispose");
		stateChanged = Reflect.get(value, "stateChanged");
	} catch (cause: unknown) {
		throw new TypeError("An extension lifecycle hook could not be read.", { cause });
	}
	if (dispose !== undefined && typeof dispose !== "function") {
		throw new TypeError("Extension dispose must be a function.");
	}
	if (stateChanged !== undefined && typeof stateChanged !== "function") {
		throw new TypeError("Extension stateChanged must be a function.");
	}
	return Object.freeze({
		...(dispose === undefined ? {} : { dispose: dispose as () => void }),
		...(stateChanged === undefined ? {} : { stateChanged: stateChanged as () => void })
	});
}

function invokeDispose(dispose: (() => void) | null): unknown {
	if (dispose === null) {
		return null;
	}
	try {
		const result = invokeForUnknownResult(dispose, []);
		if (observeThenable(result, () => undefined)) {
			return new TypeError("Extension disposal must return void synchronously.");
		}
		return result === undefined ? null : new TypeError("Extension disposal must return void.");
	} catch (cause: unknown) {
		return cause;
	}
}
