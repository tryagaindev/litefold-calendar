/** Narrows an event target using the host realm rather than the package realm. */
export function getEventElement(window, target) {
    const ElementConstructor = window?.Element;
    return ElementConstructor !== undefined && target instanceof ElementConstructor ? target : null;
}
/** Resolves the host's effective text direction with a non-window fallback. */
export function resolveTextDirection(window, host) {
    if (window !== null && typeof window.getComputedStyle === "function") {
        return window.getComputedStyle(host).direction === "rtl" ? "rtl" : "ltr";
    }
    return host.closest("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl" ? "rtl" : "ltr";
}
//# sourceMappingURL=environment.js.map