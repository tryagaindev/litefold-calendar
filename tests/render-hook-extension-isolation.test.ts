import assert from "node:assert/strict";
import test from "node:test";

import type {
	CalendarDayRenderContext,
	CalendarEventRenderContext,
	CalendarGridOverflowContentContext,
	CalendarMultipleEventIndicatorContext,
	CalendarRenderContext,
	CalendarRenderHooks
} from "../src/index.js";
import type { RegisteredExtensionCapability } from "../src/internal/runtime/registered-extension-contract.js";

type ExtensionOnlyContextKey =
	| Exclude<RegisteredExtensionCapability, "document">
	| "fail"
	| "isLive";
type ExtensionLifecycleKey = "activate" | "capabilities" | "dispose" | "stateChanged";
type HasNoKeys<TValue, TKey extends PropertyKey> =
	[Extract<keyof TValue, TKey>] extends [never] ? true : false;

const RENDER_HOOK_EXTENSION_BOUNDARIES: readonly [
	HasNoKeys<CalendarRenderContext, ExtensionOnlyContextKey>,
	HasNoKeys<CalendarDayRenderContext, ExtensionOnlyContextKey>,
	HasNoKeys<CalendarEventRenderContext, ExtensionOnlyContextKey>,
	HasNoKeys<CalendarGridOverflowContentContext, ExtensionOnlyContextKey>,
	HasNoKeys<CalendarMultipleEventIndicatorContext, ExtensionOnlyContextKey>,
	HasNoKeys<CalendarRenderHooks, ExtensionLifecycleKey>
] = [true, true, true, true, true, true];

void test("render-hook types expose no extension capabilities or lifecycle", () => {
	assert.deepEqual(RENDER_HOOK_EXTENSION_BOUNDARIES, [true, true, true, true, true, true]);
});
