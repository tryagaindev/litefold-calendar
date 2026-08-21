import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

const EXPOSED_GLOBALS = [
	"AbortController",
	"CustomEvent",
	"DOMException",
	"Element",
	"Event",
	"HTMLElement",
	"HTMLButtonElement",
	"KeyboardEvent",
	"MouseEvent",
	"Node"
] as const;

const OPEN_POPOVERS = new WeakSet<HTMLElement>();

export interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly reject: (reason?: unknown) => void;
	readonly resolve: (value: T | PromiseLike<T>) => void;
}

export interface PagerTestGeometry {
	readonly centerOffset: number;
	readonly nextOffset: number;
	readonly previousOffset: number;
}

export function createDom(markup = '<div id="calendar"></div>'): JSDOM {
	const dom = new JSDOM(markup, {
		pretendToBeVisual: true,
		url: "https://example.test/calendar"
	});
	installPopoverStubs(dom);
	return dom;
}

/** Reports the open state maintained by the JSDOM Popover API shim. */
export function isPopoverOpen(element: HTMLElement): boolean {
	return OPEN_POPOVERS.has(element);
}

export function installDom(dom: JSDOM): () => void {
	const descriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
	const install = (name: PropertyKey, value: unknown): void => {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value,
			writable: true
		});
	};

	install("window", dom.window);
	install("document", dom.window.document);
	for (const name of EXPOSED_GLOBALS) {
		install(name, dom.window[name]);
	}

	return (): void => {
		for (const [name, descriptor] of descriptors) {
			if (descriptor === undefined) {
				Reflect.deleteProperty(globalThis, name);
			} else {
				Object.defineProperty(globalThis, name, descriptor);
			}
		}
		dom.window.close();
	};
}

export function getHost(dom: JSDOM): HTMLElement {
	const element = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(element, "Expected the calendar host to exist.");
	return element;
}

export function dispatchClick(dom: JSDOM, element: Element, detail = 0): void {
	element.dispatchEvent(new dom.window.MouseEvent("click", {
		bubbles: true,
		cancelable: true,
		detail
	}));
}

export function dispatchKey(
	dom: JSDOM,
	element: Element,
	key: string,
	shiftKey = false
): KeyboardEvent {
	const event = new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key,
		shiftKey
	});
	element.dispatchEvent(event);
	return event;
}

export function dispatchPointer(
	dom: JSDOM,
	target: Element,
	type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
	pointerId: number,
	clientX: number,
	clientY: number
): Event {
	const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		clientX: { value: clientX },
		clientY: { value: clientY },
		isPrimary: { value: true },
		pointerId: { value: pointerId },
		pointerType: { value: "touch" }
	});
	target.dispatchEvent(event);
	return event;
}

export function installPagerGeometry(
	viewport: HTMLElement,
	previousLane: HTMLElement,
	grid: HTMLElement,
	nextLane: HTMLElement,
	rtl = false,
	viewportWidth = 360,
	laneWidth = 90
): PagerTestGeometry {
	const viewportLeft = 25;
	const maxOffset = laneWidth * 2;
	let scrollLeft = viewport.scrollLeft;
	const rectangle = (left: number, width: number): DOMRect => ({
		bottom: 100,
		height: 100,
		left,
		right: left + width,
		top: 0,
		width,
		x: left,
		y: 0,
		toJSON: () => ({})
	});
	Object.defineProperties(viewport, {
		clientWidth: { configurable: true, value: viewportWidth },
		getBoundingClientRect: {
			configurable: true,
			value: (): DOMRect => rectangle(viewportLeft, viewportWidth)
		},
		scrollLeft: {
			configurable: true,
			get: (): number => scrollLeft,
			set: (value: number): void => {
				scrollLeft = value;
			}
		},
		scrollWidth: { configurable: true, value: viewportWidth + maxOffset }
	});
	const installItem = (element: HTMLElement, contentOffset: number, width: number): void => {
		Object.defineProperties(element, {
			getBoundingClientRect: {
				configurable: true,
				value: (): DOMRect => rectangle(viewportLeft + contentOffset - scrollLeft, width)
			},
			offsetLeft: { configurable: true, value: contentOffset },
			offsetParent: { configurable: true, value: viewport },
			offsetWidth: { configurable: true, value: width }
		});
	};
	installItem(rtl ? nextLane : previousLane, 0, laneWidth);
	installItem(grid, laneWidth, viewportWidth);
	installItem(rtl ? previousLane : nextLane, laneWidth + viewportWidth, laneWidth);
	return {
		centerOffset: laneWidth,
		nextOffset: rtl ? 0 : maxOffset,
		previousOffset: rtl ? maxOffset : 0
	};
}

export function deferred<T>(): Deferred<T> {
	let rejectPromise: (reason?: unknown) => void = () => undefined;
	let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
	const promise = new Promise<T>((resolve, reject) => {
		rejectPromise = reject;
		resolvePromise = resolve;
	});
	return {
		promise,
		reject: rejectPromise,
		resolve: resolvePromise
	};
}

export async function waitFor(predicate: () => boolean, message = "condition"): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	assert.fail(`Timed out waiting for ${message}.`);
}

function installPopoverStubs(dom: JSDOM): void {
	const prototype = dom.window.HTMLElement.prototype;
	const dispatchToggle = (
		element: HTMLElement,
		oldState: "closed" | "open",
		newState: "closed" | "open",
		type: "beforetoggle" | "toggle"
	): boolean => {
		const event = new dom.window.Event(type, {
			bubbles: false,
			cancelable: type === "beforetoggle"
		});
		Object.defineProperties(event, {
			newState: { value: newState },
			oldState: { value: oldState }
		});
		return element.dispatchEvent(event);
	};
	const setOpen = (element: HTMLElement, open: boolean): void => {
		const wasOpen = OPEN_POPOVERS.has(element);
		if (wasOpen === open) {
			return;
		}
		const oldState = wasOpen ? "open" : "closed";
		const newState = open ? "open" : "closed";
		if (!dispatchToggle(element, oldState, newState, "beforetoggle")) {
			return;
		}
		if (open) {
			OPEN_POPOVERS.add(element);
		} else {
			OPEN_POPOVERS.delete(element);
		}
		dispatchToggle(element, oldState, newState, "toggle");
	};

	Object.defineProperties(prototype, {
		hidePopover: {
			configurable: true,
			value(this: HTMLElement): void {
				setOpen(this, false);
			}
		},
		matches: {
			configurable: true,
			value(this: HTMLElement, selectors: string): boolean {
				return selectors === ":popover-open"
					? OPEN_POPOVERS.has(this)
					: dom.window.Element.prototype.matches.call(this, selectors);
			}
		},
		popover: {
			configurable: true,
			get(this: HTMLElement): string | null {
				return this.getAttribute("popover");
			},
			set(this: HTMLElement, value: string | null) {
				if (value === null) {
					this.removeAttribute("popover");
				} else {
					this.setAttribute("popover", value);
				}
			}
		},
		showPopover: {
			configurable: true,
			value(this: HTMLElement): void {
				setOpen(this, true);
			}
		},
		togglePopover: {
			configurable: true,
			value(this: HTMLElement, force?: boolean): boolean {
				const open = force ?? !OPEN_POPOVERS.has(this);
				setOpen(this, open);
				return OPEN_POPOVERS.has(this);
			}
		}
	});

	dom.window.document.addEventListener("click", (event) => {
		if (event.defaultPrevented || !(event.target instanceof dom.window.Element)) {
			return;
		}
		const invoker = event.target.closest<HTMLButtonElement>("button[popovertarget]");
		if (invoker === null) {
			return;
		}
		const targetId = invoker.getAttribute("popovertarget");
		if (targetId === null) {
			return;
		}
		const target = dom.window.document.getElementById(targetId);
		if (!(target instanceof dom.window.HTMLElement) || !target.hasAttribute("popover")) {
			return;
		}
		switch (invoker.getAttribute("popovertargetaction") ?? "toggle") {
			case "hide": target.hidePopover(); break;
			case "show": target.showPopover(); break;
			default: target.togglePopover(); break;
		}
	});
}
