import { hasNodeLease } from "./node-leases.js";
/** Captures package-owned element topology and markup before consumer render code runs. */
export function captureRenderHookElementIntegrity(elements) {
    const uniqueElements = [...new Set(elements.filter((element) => element !== null))];
    const states = [];
    const capturedNodes = new Set();
    for (const element of uniqueElements) {
        captureNodeState(element, capturedNodes, states);
    }
    return Object.freeze({
        states: Object.freeze(states)
    });
}
/** Rejects direct mutation of package-owned elements exposed for render-hook inspection. */
export function assertRenderHookElementIntegrity(snapshot, hookName) {
    for (const state of snapshot.states) {
        if (state.node.parentNode !== state.parent ||
            !hasIdenticalNodeValueAndAttributes(state) ||
            !hasIdenticalChildren(state.node, state.children)) {
            throw new TypeError(`${hookName} must not mutate package-owned render elements directly.`);
        }
    }
}
/** Rejects package-owned attribute or text changes while allowing an owned slot to receive output. */
export function assertRenderHookElementValueIntegrity(snapshot, hookName) {
    if (snapshot.states.some((state) => !hasIdenticalNodeValueAndAttributes(state))) {
        throw new TypeError(`${hookName} output must not change package-owned render attributes or text when mounted.`);
    }
}
/** Captures one package-owned node's attributes and text without traversing its children. */
export function captureRenderHookNodeValueIntegrity(node) {
    return Object.freeze({
        attributes: captureAttributes(node),
        nodeValue: node.nodeValue
    });
}
/** Returns whether one package-owned node retains its captured attributes and text. */
export function hasRenderHookNodeValueIntegrity(node, snapshot) {
    return node.nodeValue === snapshot.nodeValue &&
        hasIdenticalAttributes(node, snapshot.attributes);
}
/** Returns every public package-owned element in one event representation. */
export function getEventRenderHookProtectedElements(elements) {
    return Object.freeze([
        elements.action,
        elements.details,
        elements.leading,
        elements.marker,
        elements.root,
        elements.time,
        elements.title,
        elements.trailing
    ]);
}
function captureAttributes(node) {
    if (node.nodeType !== 1) {
        return Object.freeze([]);
    }
    const element = node;
    return Object.freeze(element.getAttributeNames().sort().flatMap((name) => [
        name,
        element.getAttribute(name) ?? ""
    ]));
}
function captureNodeState(node, capturedNodes, states) {
    if (capturedNodes.has(node)) {
        return;
    }
    capturedNodes.add(node);
    const children = Object.freeze([...node.childNodes]);
    states.push(Object.freeze({
        ...captureRenderHookNodeValueIntegrity(node),
        children,
        node,
        parent: node.parentNode
    }));
    for (const child of children) {
        if (hasNodeLease(child)) {
            continue;
        }
        captureNodeState(child, capturedNodes, states);
    }
}
function hasIdenticalNodeValueAndAttributes(state) {
    return hasRenderHookNodeValueIntegrity(state.node, state);
}
function hasIdenticalAttributes(node, expected) {
    const current = captureAttributes(node);
    return current.length === expected.length && current.every((value, index) => value === expected[index]);
}
function hasIdenticalChildren(node, expected) {
    return node.childNodes.length === expected.length && expected.every((child, index) => node.childNodes.item(index) === child);
}
//# sourceMappingURL=render-hook-element-integrity.js.map