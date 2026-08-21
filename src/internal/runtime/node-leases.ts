const NODE_LEASES = new WeakMap<Node, object>();

/** Returns whether a node is currently leased by any live package subsystem. */
export function hasNodeLease(node: Node): boolean {
	return NODE_LEASES.has(node);
}

/** Returns whether a node remains leased by the supplied owner token. */
export function ownsNodeLease(node: Node, owner: object): boolean {
	return NODE_LEASES.get(node) === owner;
}

/** Claims a previously validated node for one package subsystem. */
export function setNodeLease(node: Node, owner: object): void {
	NODE_LEASES.set(node, owner);
}

/** Releases a node only when the supplied subsystem still owns it. */
export function releaseNodeLease(node: Node, owner: object): void {
	if (ownsNodeLease(node, owner)) {
		NODE_LEASES.delete(node);
	}
}

/** Removes and releases coordinator-tracked nodes while preserving cleanup failures. */
export function releaseLeasedNodes(nodes: Map<Node, Node>, owner: object): unknown[] {
	const errors: unknown[] = [];
	const trackedNodes = [...nodes];
	nodes.clear();
	for (const [node, expectedParent] of trackedNodes) {
		if (!ownsNodeLease(node, owner)) {
			continue;
		}
		try {
			if (node.parentNode === expectedParent) {
				expectedParent.removeChild(node);
			}
		} catch (cause: unknown) {
			errors.push(cause);
		} finally {
			releaseNodeLease(node, owner);
		}
	}
	return errors;
}
