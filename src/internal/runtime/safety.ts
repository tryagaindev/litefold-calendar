import { LitefoldCalendarError, reportCalendarError } from "../../errors.js";

const INTERACTIVE_ROLES = new Set([
	"button", "checkbox", "combobox", "grid", "gridcell", "link", "listbox", "menu", "menubar",
	"menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "radiogroup", "scrollbar",
	"searchbox", "slider", "spinbutton", "switch", "tab", "tablist", "textbox", "tree", "treegrid",
	"treeitem"
]);
const INTERACTIVE_TAGS = new Set([
	"button", "details", "embed", "iframe", "label", "select", "summary", "textarea"
]);

/** Returns whether extension output contains controls or focusable descendants. */
export function containsInteractiveContent(root: Node): boolean {
	const pending: Node[] = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.nodeType === 1 && hasInteractiveSemantics(node as Element)) {
			return true;
		}
		if (node.nodeType === 1) {
			const shadowRoot = (node as Element).shadowRoot;
			if (shadowRoot !== null) {
				pending.push(shadowRoot);
			}
		}
		for (const child of node.childNodes) {
			pending.push(child);
		}
	}
	return false;
}

/** Returns whether extension output can contribute visible content. */
export function containsPresentationalContent(root: Node): boolean {
	const pending: Node[] = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (isHtmlTemplateElement(node)) {
			continue;
		}
		if (node.nodeType === 1 || (node.nodeType === 3 && (node.nodeValue ?? "").trim().length > 0)) {
			return true;
		}
		for (const child of node.childNodes) {
			pending.push(child);
		}
	}
	return false;
}

function isHtmlTemplateElement(node: Node): boolean {
	if (node.nodeType !== 1) {
		return false;
	}
	const element = node as Element;
	if (element.localName.toLowerCase() !== "template") {
		return false;
	}
	return element.namespaceURI === element.ownerDocument.createElement("template").namespaceURI;
}

/** Returns whether an unknown value is a non-null object or function-property carrier. */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === "object" && value !== null;
}

/** Identifies valid Date values without relying on a realm-specific constructor. */
export function isDateInstance(value: unknown): value is Date {
	if (!isRecord(value)) {
		return false;
	}
	try {
		return !Number.isNaN(Date.prototype.getTime.call(value));
	} catch {
		return false;
	}
}

/** Identifies a genuine HTMLElement through its standard Web IDL attribute brand check. */
export function isHTMLElementLike(value: unknown): value is HTMLElement {
	if (!isRecord(value)) {
		return false;
	}
	try {
		const HTMLElementConstructor = Reflect.get(globalThis, "HTMLElement");
		if (typeof HTMLElementConstructor !== "function") {
			return false;
		}
		const prototype = Reflect.get(HTMLElementConstructor, "prototype");
		if (!isRecord(prototype)) {
			return false;
		}
		const titleGetter = Reflect.getOwnPropertyDescriptor(prototype, "title")?.get;
		return typeof titleGetter === "function" &&
			typeof Reflect.apply(titleGetter, value, []) === "string";
	} catch {
		return false;
	}
}

function isNodeLike(value: unknown): value is Node {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	try {
		return typeof Reflect.get(value, "nodeType") === "number" &&
			Reflect.get(value, "ownerDocument") !== undefined;
	} catch {
		return false;
	}
}

/** Identifies a node owned by a specific document. */
export function isSameDocumentNode(document: Document, value: unknown): value is Node {
	if (!isNodeLike(value)) {
		return false;
	}
	try {
		return value.ownerDocument === document;
	} catch {
		return false;
	}
}

/** Returns whether a node kind may be appended to a package-owned container. */
export function isAppendableNode(value: Node): boolean {
	try {
		return value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 8 || value.nodeType === 11;
	} catch {
		return false;
	}
}

/** Identifies the package's typed error without leaking proxy failures. */
export function isLitefoldCalendarError(value: unknown): value is LitefoldCalendarError {
	try {
		return value instanceof LitefoldCalendarError;
	} catch {
		return false;
	}
}

function hasInteractiveSemantics(element: Element): boolean {
	const tagName = element.tagName.toLowerCase();
	const contentEditable = element.getAttribute("contenteditable");
	const roles = element.getAttribute("role")?.trim().toLowerCase().split(/\s+/u) ?? [];
	const hasStringHandler = Array.from(element.attributes).some((attribute) =>
		attribute.name.toLowerCase().startsWith("on")
	);

	return INTERACTIVE_TAGS.has(tagName) ||
		(tagName === "input" && element.getAttribute("type")?.toLowerCase() !== "hidden") ||
		((tagName === "audio" || tagName === "video") && element.hasAttribute("controls")) ||
		((tagName === "img" || tagName === "object") && element.hasAttribute("usemap")) ||
		((tagName === "a" || tagName === "area") && element.hasAttribute("href")) ||
		(contentEditable !== null && contentEditable.toLowerCase() !== "false") ||
		element.hasAttribute("tabindex") || hasStringHandler ||
		roles.some((role) => INTERACTIVE_ROLES.has(role));
}

/** Invokes a callback while retaining its otherwise-void runtime return value. */
export function invokeForUnknownResult(callback: unknown, argumentsList: readonly unknown[]): unknown {
	if (typeof callback !== "function") {
		throw new TypeError("A calendar callback must be callable.");
	}
	return Reflect.apply(callback, undefined, argumentsList);
}

/** Observes an unsupported thenable returned by a synchronous integration callback. */
export function observeThenable(
	value: unknown,
	onRejected: (cause: unknown) => void,
	onFulfilled?: () => void
): boolean {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") {
		return false;
	}
	let then: unknown;
	try {
		then = Reflect.get(value, "then");
	} catch (cause: unknown) {
		safelyReportThenableRejection(onRejected, cause);
		return true;
	}
	if (typeof then !== "function") {
		return false;
	}
	try {
		void Promise.resolve(value).then(
			() => {
				try {
					onFulfilled?.();
				} catch (reportingFailure: unknown) {
					reportCalendarError(reportingFailure);
				}
			},
			(cause: unknown) => { safelyReportThenableRejection(onRejected, cause); }
		);
	} catch (cause: unknown) {
		safelyReportThenableRejection(onRejected, cause);
	}
	return true;
}

function safelyReportThenableRejection(onRejected: (cause: unknown) => void, cause: unknown): void {
	try {
		onRejected(cause);
	} catch (reportingFailure: unknown) {
		reportCalendarError(new AggregateError(
			[cause, reportingFailure],
			"A calendar callback rejection could not be reported."
		));
	}
}
