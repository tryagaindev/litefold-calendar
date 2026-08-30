import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import { REPOSITORY_ROOT } from "../lib/process.mjs";

const EXAMPLE_DIRECTORY = join(REPOSITORY_ROOT, "examples", "advanced");
const OUTPUT_MODULE = join(EXAMPLE_DIRECTORY, "main.js");
const EXPOSED_GLOBALS = [
	"AbortController",
	"AbortSignal",
	"CustomEvent",
	"DOMException",
	"Element",
	"Event",
	"FocusEvent",
	"HTMLAnchorElement",
	"HTMLButtonElement",
	"HTMLDialogElement",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLOListElement",
	"HTMLSelectElement",
	"HTMLTimeElement",
	"KeyboardEvent",
	"MouseEvent",
	"MutationObserver",
	"Node"
];

function installPopoverStubs(dom, openPopovers) {
	const prototype = dom.window.HTMLElement.prototype;
	const matches = prototype.matches;
	const dispatchToggle = (element, oldState, newState, type) => {
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
	const setOpen = (element, open) => {
		const wasOpen = openPopovers.has(element);
		if (wasOpen === open) {
			return;
		}
		const oldState = wasOpen ? "open" : "closed";
		const newState = open ? "open" : "closed";
		if (!dispatchToggle(element, oldState, newState, "beforetoggle")) {
			return;
		}
		if (open) {
			openPopovers.add(element);
		} else {
			openPopovers.delete(element);
		}
		dispatchToggle(element, oldState, newState, "toggle");
	};

	Object.defineProperties(prototype, {
		hidePopover: {
			configurable: true,
			value() {
				setOpen(this, false);
			}
		},
		matches: {
			configurable: true,
			value(selectors) {
				return selectors === ":popover-open"
					? openPopovers.has(this)
					: matches.call(this, selectors);
			}
		},
		popover: {
			configurable: true,
			get() {
				return this.getAttribute("popover");
			},
			set(value) {
				if (value === null) {
					this.removeAttribute("popover");
				} else {
					this.setAttribute("popover", value);
				}
			}
		},
		showPopover: {
			configurable: true,
			value() {
				setOpen(this, true);
			}
		},
		togglePopover: {
			configurable: true,
			value(force) {
				const open = force ?? !openPopovers.has(this);
				setOpen(this, open);
				return openPopovers.has(this);
			}
		}
	});

	dom.window.document.addEventListener("click", (event) => {
		if (event.defaultPrevented || !(event.target instanceof dom.window.Element)) {
			return;
		}
		const invoker = event.target.closest("button[popovertarget]");
		const targetId = invoker?.getAttribute("popovertarget");
		if (invoker === null || targetId === null) {
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

function installDialogStubs(dom) {
	const eventDialog = dom.window.document.querySelector("[data-my-event-dialog]");
	assert.ok(eventDialog instanceof dom.window.HTMLDialogElement, "Expected the native event-details dialog.");
	if (typeof eventDialog.showModal !== "function") {
		Object.defineProperty(eventDialog, "showModal", {
			configurable: true,
			value() {
				this.setAttribute("open", "");
				this.querySelector("[autofocus]")?.focus();
			}
		});
	}
	if (typeof eventDialog.close !== "function") {
		Object.defineProperty(eventDialog, "close", {
			configurable: true,
			value() {
				this.removeAttribute("open");
			}
		});
	}
}

export async function createAdvancedSmokeEnvironment() {
	const markup = await readFile(join(EXAMPLE_DIRECTORY, "index.html"), "utf8");
	const dom = new JSDOM(markup, {
		pretendToBeVisual: true,
		url: "https://example.test/examples/advanced/"
	});
	const openPopovers = new WeakSet();
	installPopoverStubs(dom, openPopovers);
	installDialogStubs(dom);

	const descriptors = new Map();
	const observedErrors = [];
	const uncaughtErrors = [];
	const originalConsoleError = console.error;
	let disposed = false;

	const installGlobal = (name, value) => {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value,
			writable: true
		});
	};
	const restoreGlobals = () => {
		for (const [name, descriptor] of descriptors) {
			if (descriptor === undefined) {
				Reflect.deleteProperty(globalThis, name);
			} else {
				Object.defineProperty(globalThis, name, descriptor);
			}
		}
	};
	const dispose = () => {
		if (disposed) {
			return;
		}
		disposed = true;
		console.error = originalConsoleError;
		dom.window.dispatchEvent(new dom.window.Event("pagehide"));
		restoreGlobals();
		dom.window.close();
	};

	try {
		installGlobal("window", dom.window);
		installGlobal("document", dom.window.document);
		for (const name of EXPOSED_GLOBALS) {
			if (name in dom.window) {
				installGlobal(name, dom.window[name]);
			}
		}
		console.error = (...arguments_) => {
			observedErrors.push(arguments_);
		};
		dom.window.addEventListener("error", (errorEvent) => {
			uncaughtErrors.push(errorEvent.error);
			errorEvent.preventDefault();
		});

		await import(`${pathToFileURL(OUTPUT_MODULE).href}?lfc-smoke=1`);
		return {
			dispose,
			document: dom.window.document,
			dom,
			isPopoverOpen: (element) => openPopovers.has(element),
			observedErrors,
			uncaughtErrors
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
