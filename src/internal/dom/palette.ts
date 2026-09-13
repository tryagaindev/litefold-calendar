import type { HostWindow } from "./environment.js";

/** Mirrors the effective host color scheme only when native light-dark() is unavailable. */
export class CalendarPalette {
	private readonly preference: MediaQueryList | null;
	private readonly observer: MutationObserver | null;
	private readonly connectionObserver: MutationObserver | null;
	private disconnected = false;

	public constructor(private readonly host: HTMLElement, private readonly window: HostWindow | null) {
		const needsFallback = typeof window?.CSS === "object" && !window.CSS.supports("color", "light-dark(white, black)");
		this.preference = needsFallback ? window.matchMedia("(prefers-color-scheme: dark)") : null;
		this.observer = needsFallback ? new window.MutationObserver(this.handleMutation) : null;
		this.connectionObserver = needsFallback ? new window.MutationObserver(this.handleConnection) : null;
		if (needsFallback) {
			this.observeAncestors();
			this.preference?.addEventListener("change", this.sync);
			host.ownerDocument.addEventListener("load", this.sync, true);
			this.sync();
		}
	}

	/** Releases listeners and removes only package-owned fallback state. */
	public disconnect(): void {
		this.disconnected = true;
		this.observer?.disconnect();
		this.connectionObserver?.disconnect();
		this.preference?.removeEventListener("change", this.sync);
		this.host.ownerDocument.removeEventListener("load", this.sync, true);
		this.host.classList.remove("lfc-palette-light", "lfc-palette-dark");
	}

	private observeAncestors(): void {
		this.observer?.disconnect();
		this.connectionObserver?.disconnect();
		for (let ancestor: HTMLElement | null = this.host; ancestor !== null; ancestor = ancestor.parentElement) {
			//Attribute changes can select application theme rules; child-list changes can reparent the host.
			this.observer?.observe(ancestor, { attributes: true, childList: true });
		}
		if (!this.host.isConnected) {
			//A document-wide observation lasts only until a detached host is attached again.
			this.connectionObserver?.observe(this.host.ownerDocument, { childList: true, subtree: true });
		}
	}

	private readonly handleMutation = (): void => {
		if (this.disconnected) {
			return;
		}
		this.observeAncestors();
		this.sync();
	};

	private readonly handleConnection = (): void => {
		if (this.host.isConnected) {
			this.handleMutation();
		}
	};

	private readonly sync = (): void => {
		if (this.disconnected || this.window === null) {
			return;
		}
		const schemes = this.window.getComputedStyle(this.host).colorScheme.split(/\s+/u);
		const dark = schemes.includes("dark") &&
			(!schemes.includes("light") || this.preference?.matches === true);
		for (const [name, enabled] of [["lfc-palette-dark", dark], ["lfc-palette-light", !dark]] as const) {
			if (this.host.classList.contains(name) !== enabled) {
				this.host.classList.toggle(name, enabled);
			}
		}
	};
}
