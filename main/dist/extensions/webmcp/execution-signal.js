export function createExecutionSignalResolver(fallbackSignal) {
    const platform = createAbortSignalPlatform(fallbackSignal);
    const fallback = createExecutionSignal(fallbackSignal, platform);
    if (fallback === null) {
        throw new TypeError("The extension lifecycle signal is not a usable AbortSignal.");
    }
    return (options) => {
        try {
            const candidate = isRecord(options)
                ? Reflect.get(options, "signal")
                : undefined;
            return createExecutionSignal(candidate, platform) ?? fallback;
        }
        catch {
            return fallback;
        }
    };
}
function createAbortSignalPlatform(referenceSignal) {
    const getAborted = findPrototypeFunction(referenceSignal, "aborted", "get");
    const addEventListener = findPrototypeFunction(referenceSignal, "addEventListener", "value");
    const removeEventListener = findPrototypeFunction(referenceSignal, "removeEventListener", "value");
    if (getAborted === null || addEventListener === null || removeEventListener === null) {
        throw new TypeError("The extension lifecycle signal does not expose AbortSignal operations.");
    }
    return Object.freeze({ addEventListener, getAborted, removeEventListener });
}
function createExecutionSignal(value, platform) {
    if (!isRecord(value)) {
        return null;
    }
    const isAborted = () => {
        const aborted = Reflect.apply(platform.getAborted, value, []);
        if (typeof aborted !== "boolean") {
            throw new TypeError("AbortSignal.aborted did not return a boolean.");
        }
        return aborted;
    };
    const addAbortListener = (listener) => {
        void Reflect.apply(platform.addEventListener, value, ["abort", listener, { once: true }]);
    };
    const removeAbortListener = (listener) => {
        void Reflect.apply(platform.removeEventListener, value, ["abort", listener]);
    };
    try {
        void isAborted();
        const listener = () => undefined;
        addAbortListener(listener);
        removeAbortListener(listener);
    }
    catch {
        return null;
    }
    return Object.freeze({ addAbortListener, isAborted, removeAbortListener });
}
function findPrototypeFunction(value, property, member) {
    let prototype = Object.getPrototypeOf(value);
    while (prototype !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
        const candidate = descriptor === undefined
            ? undefined
            : Reflect.get(descriptor, member);
        if (typeof candidate === "function") {
            return candidate;
        }
        prototype = Object.getPrototypeOf(prototype);
    }
    return null;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=execution-signal.js.map