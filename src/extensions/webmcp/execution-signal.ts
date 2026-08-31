type UnknownFunction = (...arguments_: never[]) => unknown;

interface AbortSignalPlatform {
	readonly addEventListener: UnknownFunction;
	readonly getAborted: UnknownFunction;
	readonly removeEventListener: UnknownFunction;
}

export interface WebMcpExecutionSignal {
	readonly addAbortListener: (this: void, listener: (this: void) => void) => void;
	readonly isAborted: (this: void) => boolean;
	readonly removeAbortListener: (this: void, listener: (this: void) => void) => void;
}

export function createExecutionSignalResolver(
	fallbackSignal: AbortSignal
): (this: void, options?: unknown) => Readonly<WebMcpExecutionSignal> {
	const platform = createAbortSignalPlatform(fallbackSignal);
	const fallback = createExecutionSignal(fallbackSignal, platform);
	if (fallback === null) {
		throw new TypeError("The extension lifecycle signal is not a usable AbortSignal.");
	}
	return (options?: unknown): Readonly<WebMcpExecutionSignal> => {
		try {
			const candidate: unknown = isRecord(options)
				? Reflect.get(options, "signal")
				: undefined;
			return createExecutionSignal(candidate, platform) ?? fallback;
		} catch {
			return fallback;
		}
	};
}

function createAbortSignalPlatform(referenceSignal: AbortSignal): Readonly<AbortSignalPlatform> {
	const getAborted = findPrototypeFunction(referenceSignal, "aborted", "get");
	const addEventListener = findPrototypeFunction(referenceSignal, "addEventListener", "value");
	const removeEventListener = findPrototypeFunction(referenceSignal, "removeEventListener", "value");
	if (getAborted === null || addEventListener === null || removeEventListener === null) {
		throw new TypeError("The extension lifecycle signal does not expose AbortSignal operations.");
	}
	return Object.freeze({ addEventListener, getAborted, removeEventListener });
}

function createExecutionSignal(
	value: unknown,
	platform: Readonly<AbortSignalPlatform>
): Readonly<WebMcpExecutionSignal> | null {
	if (!isRecord(value)) {
		return null;
	}
	const isAborted = (): boolean => {
		const aborted: unknown = Reflect.apply(platform.getAborted, value, []);
		if (typeof aborted !== "boolean") {
			throw new TypeError("AbortSignal.aborted did not return a boolean.");
		}
		return aborted;
	};
	const addAbortListener = (listener: (this: void) => void): void => {
		void Reflect.apply(platform.addEventListener, value, ["abort", listener, { once: true }]);
	};
	const removeAbortListener = (listener: (this: void) => void): void => {
		void Reflect.apply(platform.removeEventListener, value, ["abort", listener]);
	};
	try {
		void isAborted();
		const listener = (): undefined => undefined;
		addAbortListener(listener);
		removeAbortListener(listener);
	} catch {
		return null;
	}
	return Object.freeze({ addAbortListener, isAborted, removeAbortListener });
}

function findPrototypeFunction(
	value: object,
	property: "aborted" | "addEventListener" | "removeEventListener",
	member: "get" | "value"
): UnknownFunction | null {
	let prototype = Object.getPrototypeOf(value) as object | null;
	while (prototype !== null) {
		const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
		const candidate: unknown = descriptor === undefined
			? undefined
			: Reflect.get(descriptor, member);
		if (typeof candidate === "function") {
			return candidate as UnknownFunction;
		}
		prototype = Object.getPrototypeOf(prototype) as object | null;
	}
	return null;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === "object" && value !== null;
}
