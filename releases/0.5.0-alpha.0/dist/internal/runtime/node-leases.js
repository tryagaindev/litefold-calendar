const NODE_LEASES = new WeakMap();
/** Returns whether a node is currently leased by any live package subsystem. */
export function hasNodeLease(node) {
    return NODE_LEASES.has(node);
}
/** Returns whether a node remains leased by the supplied owner token. */
export function ownsNodeLease(node, owner) {
    return NODE_LEASES.get(node) === owner;
}
/** Claims a previously validated node for one package subsystem. */
export function setNodeLease(node, owner) {
    NODE_LEASES.set(node, owner);
}
/** Releases a node only when the supplied subsystem still owns it. */
export function releaseNodeLease(node, owner) {
    if (ownsNodeLease(node, owner)) {
        NODE_LEASES.delete(node);
    }
}
/** Removes and releases coordinator-tracked nodes while preserving cleanup failures. */
export function releaseLeasedNodes(nodes, owner) {
    const errors = [];
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
        }
        catch (cause) {
            errors.push(cause);
        }
        finally {
            releaseNodeLease(node, owner);
        }
    }
    return errors;
}
//# sourceMappingURL=node-leases.js.map