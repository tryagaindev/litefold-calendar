import type { EventRepresentationElements } from "../dom/event-representation.js";
import { hasNodeLease } from "./node-leases.js";

/** Package-owned attributes and text captured before consumer code can connect. */
export interface RenderHookNodeValueIntegritySnapshot {
	readonly attributes: readonly string[];
	readonly nodeValue: string | null;
}

interface ProtectedNodeState extends RenderHookNodeValueIntegritySnapshot {
	readonly children: readonly ChildNode[];
	readonly node: Node;
	readonly parent: ParentNode | null;
}

/** Immutable package-element state captured across one consumer render-hook invocation. */
export interface RenderHookElementIntegritySnapshot {
	readonly states: readonly Readonly<ProtectedNodeState>[];
}

/** Captures package-owned element topology and markup before consumer render code runs. */
export function captureRenderHookElementIntegrity(
	elements: readonly (Node | null)[]
): Readonly<RenderHookElementIntegritySnapshot> {
	const uniqueElements = [...new Set(elements.filter((element) => element !== null))];
	const states: ProtectedNodeState[] = [];
	const capturedNodes = new Set<Node>();
	for (const element of uniqueElements) {
		captureNodeState(element, capturedNodes, states);
	}
	return Object.freeze({
		states: Object.freeze(states)
	});
}

/** Rejects direct mutation of package-owned elements exposed for render-hook inspection. */
export function assertRenderHookElementIntegrity(
	snapshot: Readonly<RenderHookElementIntegritySnapshot>,
	hookName: string
): void {
	for (const state of snapshot.states) {
		if (state.node.parentNode !== state.parent ||
			!hasIdenticalNodeValueAndAttributes(state) ||
			!hasIdenticalChildren(state.node, state.children)) {
			throw new TypeError(
				`${hookName} must not mutate package-owned render elements directly.`
			);
		}
	}
}

/** Rejects package-owned attribute or text changes while allowing an owned slot to receive output. */
export function assertRenderHookElementValueIntegrity(
	snapshot: Readonly<RenderHookElementIntegritySnapshot>,
	hookName: string
): void {
	if (snapshot.states.some((state) => !hasIdenticalNodeValueAndAttributes(state))) {
		throw new TypeError(
			`${hookName} output must not change package-owned render attributes or text when mounted.`
		);
	}
}

/** Captures one package-owned node's attributes and text without traversing its children. */
export function captureRenderHookNodeValueIntegrity(
	node: Node
): Readonly<RenderHookNodeValueIntegritySnapshot> {
	return Object.freeze({
		attributes: captureAttributes(node),
		nodeValue: node.nodeValue
	});
}

/** Returns whether one package-owned node retains its captured attributes and text. */
export function hasRenderHookNodeValueIntegrity(
	node: Node,
	snapshot: Readonly<RenderHookNodeValueIntegritySnapshot>
): boolean {
	return node.nodeValue === snapshot.nodeValue &&
		hasIdenticalAttributes(node, snapshot.attributes);
}

/** Returns every public package-owned element in one event representation. */
export function getEventRenderHookProtectedElements(
	elements: Readonly<EventRepresentationElements>
): readonly (HTMLElement | null)[] {
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

function captureAttributes(node: Node): readonly string[] {
	if (node.nodeType !== 1) {
		return Object.freeze([]);
	}
	const element = node as Element;
	return Object.freeze(element.getAttributeNames().sort().flatMap((name) => [
		name,
		element.getAttribute(name) ?? ""
	]));
}

function captureNodeState(
	node: Node,
	capturedNodes: Set<Node>,
	states: ProtectedNodeState[]
): void {
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

function hasIdenticalNodeValueAndAttributes(state: Readonly<ProtectedNodeState>): boolean {
	return hasRenderHookNodeValueIntegrity(state.node, state);
}

function hasIdenticalAttributes(node: Node, expected: readonly string[]): boolean {
	const current = captureAttributes(node);
	return current.length === expected.length && current.every((value, index) => value === expected[index]);
}

function hasIdenticalChildren(node: Node, expected: readonly ChildNode[]): boolean {
	return node.childNodes.length === expected.length && expected.every((child, index) =>
		node.childNodes.item(index) === child);
}
