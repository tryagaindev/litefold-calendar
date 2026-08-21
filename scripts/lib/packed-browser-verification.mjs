import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

const DOM_GLOBAL_NAMES = [
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
];

function installDomGlobals(dom) {
	const descriptors = new Map();
	const install = (name, value) => {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value,
			writable: true
		});
	};

	install("window", dom.window);
	install("document", dom.window.document);
	for (const name of DOM_GLOBAL_NAMES) {
		install(name, dom.window[name]);
	}

	return () => {
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

export async function verifyPackedBrowserInteraction(installedPackage) {
	const entryPath = join(installedPackage, "dist", "index.js");
	const packageModule = await import(`${pathToFileURL(entryPath).href}?packed-byte-check=${Date.now().toString()}`);
	if (typeof packageModule.createCalendar !== "function") {
		throw new Error("Packed root module must export createCalendar().");
	}

	const dom = new JSDOM('<div id="calendar"></div>', {
		pretendToBeVisual: true,
		url: "https://example.test/calendar"
	});
	const restoreGlobals = installDomGlobals(dom);
	try {
		const host = dom.window.document.querySelector("#calendar");
		if (!(host instanceof dom.window.HTMLElement)) {
			throw new Error("Packed-byte browser fixture could not create its host.");
		}
		let activation = null;
		const calendar = packageModule.createCalendar(host, {
			events: [{
				id: "packed-byte-event",
				start: "2026-07-14T09:00",
				title: "Packed byte interaction"
			}],
			initialDate: "2026-07-14",
			now: () => new Date("2026-07-14T12:00:00Z"),
			onEventActivate: (context) => {
				activation = context;
			}
		});
		calendar.render();
		for (let attempt = 0; attempt < 200 && calendar.getState().phase !== "ready"; attempt += 1) {
			await new Promise((resolvePromise) => {
				setTimeout(resolvePromise, 0);
			});
		}
		if (calendar.getState().phase !== "ready") {
			throw new Error(`Packed calendar did not become ready; phase was ${calendar.getState().phase}.`);
		}

		const action = host.querySelector(
			".lfc-calendar-agenda button[data-lfc-event-id='packed-byte-event']"
		);
		if (!(action instanceof dom.window.HTMLButtonElement)) {
			throw new Error("Packed calendar did not render its actionable agenda event.");
		}
		const nativeEvent = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
		action.dispatchEvent(nativeEvent);
		if (activation?.event?.id !== "packed-byte-event" || activation.nativeEvent !== nativeEvent ||
			activation.surface !== "agenda") {
			throw new Error("Packed calendar did not activate the rendered event through its public callback.");
		}

		calendar.destroy();
		calendar.destroy();
		if (host.childNodes.length !== 0 || host.classList.contains("litefold-calendar") ||
			host.hasAttribute("data-litefold-calendar") || action.isConnected) {
			throw new Error("Packed calendar destroy() did not release its rendered host.");
		}
	} finally {
		restoreGlobals();
	}
}
