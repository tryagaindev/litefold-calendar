import assert from "node:assert/strict";
import test from "node:test";

import { installEventActionListeners } from "../src/internal/dom/event-structure.js";
import type { CalendarEventActionElement } from "../src/types.js";
import { createDom } from "./helpers/dom.js";

void test("event actions consolidate listener types while preserving activation and context ordering", () => {
	const dom = createDom();
	const action = dom.window.document.createElement("button");
	const calls: string[] = [];
	Object.defineProperty(action, "getBoundingClientRect", {
		configurable: true,
		value: (): DOMRect => createRectangle(11, 22)
	});

	const registrations = captureListenerRegistrations(action, () => {
		installEventActionListeners({
			action,
			hasContextAction: true,
			isCurrent: () => true,
			onActivate: (event) => { calls.push(`activate:${event.clientX.toString()}:${event.clientY.toString()}`); },
			onContext: (event, clientX, clientY) => {
				calls.push(`context:${event.type}:${clientX.toString()}:${clientY.toString()}`);
			},
			onGridKeydown: (event) => { calls.push(`grid:${event.key}`); },
			surface: "grid-summary"
		});
	});

	assert.deepEqual(registrations, ["click", "keydown", "contextmenu"]);
	assert.equal(action.getAttribute("aria-keyshortcuts"), "F2 Shift+F10");

	const click = new dom.window.MouseEvent("click", {
		bubbles: true,
		cancelable: true,
		clientX: 7,
		clientY: 9
	});
	action.dispatchEvent(click);
	assert.deepEqual(calls, ["activate:7:9"]);

	calls.length = 0;
	const keyboardContext = new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "ContextMenu"
	});
	action.dispatchEvent(keyboardContext);
	assert.equal(keyboardContext.defaultPrevented, true);
	assert.deepEqual(calls, ["grid:ContextMenu", "context:keydown:11:22"]);

	calls.length = 0;
	const pointerContext = new dom.window.MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		clientX: 13,
		clientY: 17
	});
	action.dispatchEvent(pointerContext);
	assert.equal(pointerContext.defaultPrevented, true);
	assert.deepEqual(calls, ["context:contextmenu:13:17"]);

	dom.window.close();
});

void test("stale actions still suppress click propagation while retaining grid-key ordering", () => {
	const dom = createDom();
	const action = dom.window.document.createElement("a");
	action.href = "/events/stale";
	let current = false;
	let laterClickCalls = 0;
	let laterContextMenuCalls = 0;
	let boundsCalls = 0;
	const calls: string[] = [];
	Object.defineProperty(action, "getBoundingClientRect", {
		configurable: true,
		value: (): DOMRect => {
			boundsCalls += 1;
			return createRectangle(19, 23);
		}
	});

	const registrations = captureListenerRegistrations(action, () => {
		installEventActionListeners({
			action,
			hasContextAction: true,
			isCurrent: () => current,
			onActivate: () => { calls.push("activate"); },
			onContext: () => { calls.push("context"); },
			onGridKeydown: (event) => {
				calls.push(`grid:${event.key}`);
				current = false;
			},
			surface: "grid-summary"
		});
	});
	action.addEventListener("click", () => { laterClickCalls += 1; });
	action.addEventListener("contextmenu", () => { laterContextMenuCalls += 1; });

	assert.deepEqual(registrations, ["click", "keydown", "contextmenu"]);
	const staleClick = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
	assert.equal(action.dispatchEvent(staleClick), false);
	assert.equal(staleClick.defaultPrevented, true);
	assert.equal(laterClickCalls, 0);
	assert.deepEqual(calls, []);

	const staleContextMenu = new dom.window.MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true
	});
	action.dispatchEvent(staleContextMenu);
	assert.equal(staleContextMenu.defaultPrevented, true);
	assert.equal(laterContextMenuCalls, 1);
	assert.deepEqual(calls, []);

	current = true;
	const keyboardContext = new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "F10",
		shiftKey: true
	});
	action.dispatchEvent(keyboardContext);
	assert.equal(keyboardContext.defaultPrevented, true);
	assert.deepEqual(calls, ["grid:F10"]);
	assert.equal(boundsCalls, 0, "Staleness must be checked after the grid-key handler.");

	dom.window.close();
});

void test("context-only primary activation remains limited to native buttons", () => {
	const dom = createDom();
	const button = dom.window.document.createElement("button");
	const link = dom.window.document.createElement("a");
	link.href = "/events/native";
	const calls: string[] = [];
	const install = (action: CalendarEventActionElement): void => {
		installEventActionListeners({
			action,
			hasContextAction: true,
			isCurrent: () => true,
			onActivate: null,
			onContext: (event) => { calls.push(`${action.tagName}:${event.type}`); },
			onGridKeydown: null,
			surface: "agenda"
		});
	};
	install(button);
	install(link);
	link.addEventListener("click", (event) => { event.preventDefault(); });

	button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
	link.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
	assert.deepEqual(calls, ["BUTTON:click"]);

	dom.window.close();
});

function captureListenerRegistrations(
	action: CalendarEventActionElement,
	install: () => void
): readonly string[] {
	const registrations: string[] = [];
	const nativeAddEventListener = action.addEventListener.bind(action) as EventTarget["addEventListener"];
	Object.defineProperty(action, "addEventListener", {
		configurable: true,
		value: (
			type: string,
			listener: EventListenerOrEventListenerObject | null,
			options?: boolean | AddEventListenerOptions
		): void => {
			registrations.push(type);
			nativeAddEventListener(type, listener, options);
		}
	});
	try {
		install();
	} finally {
		Reflect.deleteProperty(action, "addEventListener");
	}
	return Object.freeze(registrations);
}

function createRectangle(left: number, bottom: number): DOMRect {
	return {
		bottom,
		height: bottom,
		left,
		right: left,
		top: 0,
		width: 0,
		x: left,
		y: 0,
		toJSON: () => ({})
	};
}
