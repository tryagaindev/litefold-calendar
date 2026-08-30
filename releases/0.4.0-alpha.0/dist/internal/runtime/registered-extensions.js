import { reportCalendarError } from "../../errors.js";
import { createConfigurationError, snapshotConfigurationArray } from "./configuration.js";
import { resolveRegisteredExtension } from "./registered-extension-contract.js";
import { invokeForUnknownResult, observeThenable } from "./safety.js";
/** Generic lifecycle host for configured first-party extensions. */
export class RegisteredExtensionManager {
    isStateNotificationPending = false;
    isStopped = false;
    options;
    runtimes;
    stateRevision = 0;
    constructor(options) {
        this.options = options;
        this.runtimes = resolveExtensionRuntimes(options.extensions);
    }
    /** Whether this calendar selected at least one extension. */
    get hasExtensions() { return this.runtimes.length > 0; }
    /** Activates all pending extensions in registration order. */
    activate() {
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
    notifyStateChanged() {
        this.stateRevision += 1;
        if (this.isStopped || this.isStateNotificationPending ||
            !this.runtimes.some((runtime) => runtime.status === "active" &&
                runtime.stateChanged !== null)) {
            return;
        }
        this.isStateNotificationPending = true;
        const dispatch = () => {
            this.isStateNotificationPending = false;
            this.dispatchStateChanged();
        };
        try {
            queueMicrotask(dispatch);
        }
        catch {
            //A replaced scheduling primitive must not break the calendar's committed state.
            dispatch();
        }
    }
    /** Aborts and disposes every activated extension in reverse registration order. */
    stop() {
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
    activateRuntime(runtime) {
        runtime.status = "activating";
        const controller = new this.options.abortControllerConstructor();
        runtime.controller = controller;
        let result;
        try {
            result = invokeForUnknownResult(runtime.definition.activate, [
                this.createActivationContext(runtime, controller)
            ]);
        }
        catch (cause) {
            this.quarantine(runtime, "activate", cause);
            return;
        }
        if (observeThenable(result, () => undefined)) {
            this.quarantine(runtime, "activate", new TypeError("Extension activation must return synchronously."));
            return;
        }
        let instance;
        try {
            instance = normalizeExtensionInstance(result);
        }
        catch (cause) {
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
    createActivationContext(runtime, controller) {
        const context = {
            fail: (cause, hook = "runtime") => {
                this.quarantine(runtime, hook, cause);
            },
            isLive: () => this.isRuntimeLive(runtime),
            signal: controller.signal
        };
        for (const capability of runtime.definition.capabilities) {
            switch (capability) {
                case "document":
                    context["document"] = this.options.document;
                    break;
                case "navigation":
                    context["navigation"] = Object.freeze({
                        navigate: (target) => {
                            this.requireRuntimeLive(runtime);
                            return this.options.navigate(target);
                        }
                    });
                    break;
                case "presentationEvents":
                    context["presentationEvents"] = Object.freeze({
                        getPage: (date, offset, limit) => {
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
        return Object.freeze(context);
    }
    dispatchStateChanged() {
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
            let result;
            try {
                result = invokeForUnknownResult(callback, []);
            }
            catch (cause) {
                this.quarantine(runtime, "stateChanged", cause);
                continue;
            }
            if (observeThenable(result, () => undefined)) {
                this.quarantine(runtime, "stateChanged", new TypeError("Extension state hooks must return void synchronously."));
            }
            else if (result !== undefined) {
                this.quarantine(runtime, "stateChanged", new TypeError("Extension state hooks must return void."));
            }
        }
        if (this.shouldRedispatch(revision)) {
            this.notifyStateChangedWithoutRevision();
        }
    }
    notifyStateChangedWithoutRevision() {
        if (this.isStateNotificationPending || this.isStopped ||
            !this.runtimes.some((runtime) => runtime.status === "active" &&
                runtime.stateChanged !== null)) {
            return;
        }
        this.isStateNotificationPending = true;
        const dispatch = () => {
            this.isStateNotificationPending = false;
            this.dispatchStateChanged();
        };
        try {
            queueMicrotask(dispatch);
        }
        catch {
            dispatch();
        }
    }
    quarantine(runtime, hook, cause) {
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
        }
        catch (abortFailure) {
            cause = new AggregateError([cause, abortFailure], "Extension failure and abort both failed.");
        }
        const cleanupFailure = invokeDispose(dispose);
        if (cleanupFailure !== null) {
            cause = new AggregateError([cause, cleanupFailure], "Extension failure and disposal both failed.");
        }
        this.reportFailure(runtime.definition.id, hook, cause);
    }
    stopRuntime(runtime, reportDisposeFailure) {
        if (runtime.status === "stopped") {
            return;
        }
        runtime.status = "stopped";
        const controller = runtime.controller;
        runtime.controller = null;
        const dispose = runtime.dispose;
        runtime.dispose = null;
        runtime.stateChanged = null;
        let failure = null;
        try {
            controller?.abort();
        }
        catch (cause) {
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
    disposeDetached(runtime, dispose) {
        const failure = invokeDispose(dispose);
        //Quarantine already owns the single diagnostic for this activation.
        if (failure !== null && runtime.status !== "quarantined") {
            this.reportFailure(runtime.definition.id, "dispose", failure);
        }
    }
    isRuntimeLive(runtime) {
        return !this.isStopped && (runtime.status === "activating" || runtime.status === "active") &&
            runtime.controller?.signal.aborted === false && this.options.isLive();
    }
    canContinue() {
        return !this.isStopped && this.options.isLive();
    }
    isActivationCurrent(runtime, controller) {
        return runtime.status === "activating" && !controller.signal.aborted && this.canContinue();
    }
    isDispatchCurrent(revision) {
        return revision === this.stateRevision && this.canContinue();
    }
    shouldRedispatch(revision) {
        return !this.isStopped && revision !== this.stateRevision;
    }
    requireRuntimeLive(runtime) {
        if (!this.isRuntimeLive(runtime)) {
            throw new Error(`Extension ${runtime.definition.id} is no longer active.`);
        }
    }
    reportFailure(runtimeId, hook, cause) {
        try {
            this.options.reportFailure(runtimeId, hook, cause);
        }
        catch (reportingFailure) {
            reportCalendarError(new AggregateError([cause, reportingFailure], `Extension ${runtimeId} failure could not be reported.`));
        }
    }
}
function resolveExtensionRuntimes(extensions) {
    if (extensions === undefined) {
        return Object.freeze([]);
    }
    let isArray;
    try {
        isArray = Array.isArray(extensions);
    }
    catch (cause) {
        throw createConfigurationError("extensions could not be inspected.", cause);
    }
    if (!isArray) {
        throw createConfigurationError("extensions must be an array.");
    }
    const snapshot = snapshotConfigurationArray(extensions, "extensions", false);
    const values = new Set();
    const identifiers = new Map();
    const runtimes = [];
    for (const [index, value] of snapshot.entries()) {
        let definition;
        try {
            definition = resolveRegisteredExtension(value);
        }
        catch (cause) {
            throw createConfigurationError(`extensions[${index.toString()}] could not be inspected.`, cause);
        }
        if (definition === null) {
            throw createConfigurationError(`extensions[${index.toString()}] is not an extension issued by this package instance.`);
        }
        if (values.has(value)) {
            throw createConfigurationError(`extensions[${index.toString()}] repeats an earlier configured extension value.`);
        }
        values.add(value);
        const firstIndex = identifiers.get(definition.id);
        if (firstIndex !== undefined) {
            throw createConfigurationError(`extensions[${index.toString()}] repeats extension ID ${definition.id} from extensions[${firstIndex.toString()}].`);
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
function normalizeExtensionInstance(value) {
    if (value === undefined) {
        return null;
    }
    if ((typeof value !== "object" && typeof value !== "function") || value === null ||
        Array.isArray(value)) {
        throw new TypeError("Extension activation must return void or a lifecycle object.");
    }
    let keys;
    try {
        keys = Reflect.ownKeys(value);
    }
    catch (cause) {
        throw new TypeError("An extension lifecycle object could not be inspected.", { cause });
    }
    if (keys.some((key) => key !== "dispose" && key !== "stateChanged")) {
        throw new TypeError("An extension lifecycle object contains an unsupported hook.");
    }
    let dispose;
    let stateChanged;
    try {
        dispose = Reflect.get(value, "dispose");
        stateChanged = Reflect.get(value, "stateChanged");
    }
    catch (cause) {
        throw new TypeError("An extension lifecycle hook could not be read.", { cause });
    }
    if (dispose !== undefined && typeof dispose !== "function") {
        throw new TypeError("Extension dispose must be a function.");
    }
    if (stateChanged !== undefined && typeof stateChanged !== "function") {
        throw new TypeError("Extension stateChanged must be a function.");
    }
    return Object.freeze({
        ...(dispose === undefined ? {} : { dispose: dispose }),
        ...(stateChanged === undefined ? {} : { stateChanged: stateChanged })
    });
}
function invokeDispose(dispose) {
    if (dispose === null) {
        return null;
    }
    try {
        const result = invokeForUnknownResult(dispose, []);
        if (observeThenable(result, () => undefined)) {
            return new TypeError("Extension disposal must return void synchronously.");
        }
        return result === undefined ? null : new TypeError("Extension disposal must return void.");
    }
    catch (cause) {
        return cause;
    }
}
//# sourceMappingURL=registered-extensions.js.map