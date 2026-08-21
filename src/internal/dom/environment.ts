/** The host document's optional browser global. */
export type HostWindow = Window & typeof globalThis;

/** Narrows an event target using the host realm rather than the package realm. */
export function getEventElement(window: HostWindow | null, target: EventTarget | null): Element | null {
	const ElementConstructor = window?.Element;
	return ElementConstructor !== undefined && target instanceof ElementConstructor ? target : null;
}

/** Resolves the host's effective text direction with a non-window fallback. */
export function resolveTextDirection(window: HostWindow | null, host: HTMLElement): "ltr" | "rtl" {
	if (window !== null && typeof window.getComputedStyle === "function") {
		return window.getComputedStyle(host).direction === "rtl" ? "rtl" : "ltr";
	}
	return host.closest("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl" ? "rtl" : "ltr";
}
