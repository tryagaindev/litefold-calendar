import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

const DOM_GLOBAL_NAMES = [
	"AbortController",
	"AbortSignal",
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
	const extensionPath = join(installedPackage, "dist", "extensions", "webmcp", "index.js");
	const { webMcp } = await import(pathToFileURL(extensionPath).href);
	if (typeof webMcp !== "function") {
		throw new Error("Packed WebMCP entry must export webMcp().");
	}

	const dom = new JSDOM('<div id="calendar"></div>', {
		pretendToBeVisual: true,
		url: "https://example.test/calendar"
	});
	const restoreGlobals = installDomGlobals(dom);
	const registeredTools = new Map();
	const registrationSignals = [];
	Object.defineProperty(dom.window.document, "modelContext", {
		value: {
			registerTool(tool, { signal }) {
				if (signal.aborted || registeredTools.has(tool.name)) {
					throw new Error("Packed WebMCP registration must be live and unique.");
				}
				registeredTools.set(tool.name, tool);
				registrationSignals.push(signal);
				signal.addEventListener("abort", () => { registeredTools.delete(tool.name); }, { once: true });
			}
		}
	});
	try {
		const host = dom.window.document.querySelector("#calendar");
		if (!(host instanceof dom.window.HTMLElement)) {
			throw new Error("Packed-byte browser fixture could not create its host.");
		}
		let activation = null;
		let overflowActivation = null;
		let overflowCompletion = null;
		const calendar = packageModule.createCalendar(host, {
			gridEventDisplay: { compact: "count", wide: "count" },
			extensions: [webMcp({ toolNamePrefix: "packed-calendar" })],
			events: [{
				id: "packed-byte-event",
				start: "2026-07-14T09:00",
				title: "Packed byte interaction"
			}],
			initialDate: "2026-07-14",
			now: () => new Date("2026-07-14T12:00:00Z"),
			onEventActivate: (context) => {
				activation = context;
			},
			onEventOverflowActivate: (context) => { overflowActivation = context; },
			onEventOverflowDefault: (context) => {
				if (context.agendaHeading !== dom.window.document.activeElement) {
					throw new Error("Packed completion must synchronously expose the focused heading.");
				}
				overflowCompletion = context;
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
		for (let attempt = 0; attempt < 200 && registeredTools.size !== 2; attempt += 1) {
			await new Promise((resolvePromise) => { setTimeout(resolvePromise, 0); });
		}
		if (registeredTools.size !== 2 || !registeredTools.has("packed-calendar-get-events") ||
			!registeredTools.has("packed-calendar-navigate") || registrationSignals[0] !== registrationSignals[1]) {
			throw new Error("Packed core and WebMCP must share registration identity and register both tools.");
		}
		const getEvents = registeredTools.get("packed-calendar-get-events");
		const initialEvents = await getEvents.execute({ date: "2026-07-14" });
		if (initialEvents.ok !== true || initialEvents.events?.length !== 1 ||
			initialEvents.events[0].title !== "Packed byte interaction") {
			throw new Error("Packed WebMCP must read the core calendar's loaded events.");
		}

		const initialAction = host.querySelector(
			".lfc-calendar-agenda button[data-lfc-event-id='packed-byte-event']"
		);
		if (!(initialAction instanceof dom.window.HTMLButtonElement)) {
			throw new Error("Packed calendar did not render its actionable agenda event.");
		}
		calendar.setEvents([{
			id: "packed-replacement",
			start: "2026-07-14T10:00",
			title: "Packed replacement interaction"
		}]);
		for (let attempt = 0; attempt < 200 && calendar.getState().phase !== "ready"; attempt += 1) {
			await new Promise((resolvePromise) => {
				setTimeout(resolvePromise, 0);
			});
		}
		if (calendar.getState().phase !== "ready" || initialAction.isConnected) {
			throw new Error("Packed calendar did not commit setEvents() replacement data.");
		}
		calendar.refetchEvents();
		for (let attempt = 0; attempt < 200 && calendar.getState().phase !== "ready"; attempt += 1) {
			await new Promise((resolvePromise) => {
				setTimeout(resolvePromise, 0);
			});
		}
		const action = host.querySelector(
			".lfc-calendar-agenda button[data-lfc-event-id='packed-replacement']"
		);
		if (!(action instanceof dom.window.HTMLButtonElement)) {
			throw new Error("Packed calendar did not refetch the latest setEvents() snapshot.");
		}
		const replacementEvents = await getEvents.execute({ date: "2026-07-14" });
		if (replacementEvents.ok !== true || replacementEvents.events?.length !== 1 ||
			replacementEvents.events[0].title !== "Packed replacement interaction" ||
			JSON.stringify(replacementEvents.state) !== JSON.stringify(calendar.getState())) {
			throw new Error("Packed WebMCP must observe the same current state after core setEvents() and refetchEvents().");
		}
		const nativeEvent = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
		action.dispatchEvent(nativeEvent);
		if (activation?.event?.id !== "packed-replacement" || activation.nativeEvent !== nativeEvent ||
			activation.surface !== "agenda") {
			throw new Error("Packed calendar did not activate the rendered event through its public callback.");
		}

		const overflow = host.querySelector(".lfc-calendar-grid-more[data-lfc-date='2026-07-14']");
		const overflowClick = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
		overflow?.dispatchEvent(overflowClick);
		if (overflowCompletion === null || overflowActivation === null ||
			overflowCompletion.triggerElement !== overflow || overflowCompletion.nativeEvent !== overflowClick ||
			overflowCompletion.events !== overflowActivation.events || overflowCompletion.date !== overflowActivation.date ||
			overflowCompletion.events[0]?.id !== "packed-replacement" || !Object.isFrozen(overflowCompletion)) {
			throw new Error("Packed consumer must receive the original immutable overflow snapshot on synchronous completion.");
		}

		calendar.destroy();
		calendar.destroy();
		if (registeredTools.size !== 0 || registrationSignals.some((signal) => !signal.aborted)) {
			throw new Error("Packed calendar destroy() must release every registered WebMCP tool.");
		}
		if (host.childNodes.length !== 0 || host.classList.contains("litefold-calendar") ||
			host.hasAttribute("data-litefold-calendar") || action.isConnected) {
			throw new Error("Packed calendar destroy() did not release its rendered host.");
		}
	} finally {
		restoreGlobals();
	}
}
