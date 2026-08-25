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
export function containsInteractiveContent(root) {
    const pending = [root];
    while (pending.length > 0) {
        const node = pending.pop();
        if (node === undefined) {
            continue;
        }
        if (node.nodeType === 1 && hasInteractiveSemantics(node)) {
            return true;
        }
        for (const child of node.childNodes) {
            pending.push(child);
        }
    }
    return false;
}
/** Returns whether an unknown value is a non-null object or function-property carrier. */
export function isRecord(value) {
    return typeof value === "object" && value !== null;
}
/** Identifies valid Date values without relying on a realm-specific constructor. */
export function isDateInstance(value) {
    if (!isRecord(value)) {
        return false;
    }
    try {
        return !Number.isNaN(Date.prototype.getTime.call(value));
    }
    catch {
        return false;
    }
}
/** Identifies an HTML element-like integration value without assuming the host realm. */
export function isHTMLElementLike(value) {
    if (!isRecord(value)) {
        return false;
    }
    try {
        const ownerDocument = Reflect.get(value, "ownerDocument");
        if (Reflect.get(value, "nodeType") !== 1 ||
            Reflect.get(value, "namespaceURI") !== "http://www.w3.org/1999/xhtml" ||
            typeof Reflect.get(value, "tagName") !== "string" || !isRecord(ownerDocument) ||
            typeof Reflect.get(ownerDocument, "createElement") !== "function") {
            return false;
        }
        const defaultView = Reflect.get(ownerDocument, "defaultView");
        const HTMLElementConstructor = isRecord(defaultView)
            ? Reflect.get(defaultView, "HTMLElement")
            : undefined;
        return typeof HTMLElementConstructor !== "function" || value instanceof HTMLElementConstructor;
    }
    catch {
        return false;
    }
}
function isNodeLike(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    try {
        return typeof Reflect.get(value, "nodeType") === "number" &&
            Reflect.get(value, "ownerDocument") !== undefined;
    }
    catch {
        return false;
    }
}
/** Identifies a node owned by a specific document. */
export function isSameDocumentNode(document, value) {
    if (!isNodeLike(value)) {
        return false;
    }
    try {
        return value.ownerDocument === document;
    }
    catch {
        return false;
    }
}
/** Returns whether a node kind may be appended to a package-owned container. */
export function isAppendableNode(value) {
    try {
        return value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 8 || value.nodeType === 11;
    }
    catch {
        return false;
    }
}
/** Identifies the package's typed error without leaking proxy failures. */
export function isLitefoldCalendarError(value) {
    try {
        return value instanceof LitefoldCalendarError;
    }
    catch {
        return false;
    }
}
function hasInteractiveSemantics(element) {
    const tagName = element.tagName.toLowerCase();
    const contentEditable = element.getAttribute("contenteditable");
    const roles = element.getAttribute("role")?.trim().toLowerCase().split(/\s+/u) ?? [];
    const hasStringHandler = Array.from(element.attributes).some((attribute) => attribute.name.toLowerCase().startsWith("on"));
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
export function invokeForUnknownResult(callback, argumentsList) {
    if (typeof callback !== "function") {
        throw new TypeError("A calendar callback must be callable.");
    }
    return Reflect.apply(callback, undefined, argumentsList);
}
/** Observes an unsupported thenable returned by a synchronous integration callback. */
export function observeThenable(value, onRejected, onFulfilled) {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return false;
    }
    let then;
    try {
        then = Reflect.get(value, "then");
    }
    catch (cause) {
        safelyReportThenableRejection(onRejected, cause);
        return true;
    }
    if (typeof then !== "function") {
        return false;
    }
    try {
        void Promise.resolve(value).then(() => {
            try {
                onFulfilled?.();
            }
            catch (reportingFailure) {
                reportCalendarError(reportingFailure);
            }
        }, (cause) => { safelyReportThenableRejection(onRejected, cause); });
    }
    catch (cause) {
        safelyReportThenableRejection(onRejected, cause);
    }
    return true;
}
function safelyReportThenableRejection(onRejected, cause) {
    try {
        onRejected(cause);
    }
    catch (reportingFailure) {
        reportCalendarError(new AggregateError([cause, reportingFailure], "A calendar callback rejection could not be reported."));
    }
}
//# sourceMappingURL=safety.js.map