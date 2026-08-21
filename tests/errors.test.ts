import assert from "node:assert/strict";
import test from "node:test";

import { isAbortError, reportCalendarError } from "../src/errors.js";

void test("abort detection treats hostile getters and proxies as ordinary failures", () => {
	const getterFailure = new Proxy({}, {
		get: () => { throw new Error("hostile name getter"); }
	});
	assert.equal(isAbortError(getterFailure), false);
	assert.equal(isAbortError({ name: "AbortError" }), true);
});

void test("a throwing global reportError never escapes synchronously", (context) => {
	const originalReporter = Object.getOwnPropertyDescriptor(globalThis, "reportError");
	const originalQueueMicrotask = globalThis.queueMicrotask;
	let queued: VoidFunction | undefined;
	Object.defineProperty(globalThis, "reportError", {
		configurable: true,
		value: () => { throw new Error("hostile reporter"); }
	});
	globalThis.queueMicrotask = (callback: VoidFunction): void => {
		queued = callback;
	};
	context.after(() => {
		if (originalReporter === undefined) {
			Reflect.deleteProperty(globalThis, "reportError");
		} else {
			Object.defineProperty(globalThis, "reportError", originalReporter);
		}
		globalThis.queueMicrotask = originalQueueMicrotask;
	});

	assert.doesNotThrow(() => { reportCalendarError(new Error("calendar failure")); });
	assert.equal(typeof queued, "function");
});
