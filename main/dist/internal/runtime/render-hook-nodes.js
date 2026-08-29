import { hasNodeLease, ownsNodeLease, releaseNodeLease, setNodeLease } from "./node-leases.js";
import { containsInteractiveContent, containsPresentationalContent, isAppendableNode, isSameDocumentNode } from "./safety.js";
/** Owns render-hook node validation, leasing, append rollback, and mounted revalidation. */
export class RenderHookNodeRenderer {
    nodeOwners = new WeakMap();
    options;
    packageSkeletons = [];
    constructor(options) {
        this.options = options;
    }
    /** Appends one synchronous render-hook result and returns whether it supplies visual content. */
    append(runtime, hookName, container, result, requirePresentationalContent = false, surface) {
        const controller = runtime.controller;
        const output = this.resolveOutput(hookName, result);
        if (requirePresentationalContent && !output.hasPresentationalContent) {
            return false;
        }
        if (!this.options.isInvocationCurrent(runtime, controller)) {
            return false;
        }
        const invocation = Object.freeze({ controller, hookName, surface });
        this.claimNodes(runtime, container, output.nodes, invocation);
        try {
            container.append(result);
        }
        catch (cause) {
            this.throwAppendFailure(runtime, container, output.nodes, invocation, hookName, cause);
        }
        const invalidCause = this.getInvalidAppendCause(runtime, container, output.nodes, invocation);
        if (invalidCause === null) {
            return output.hasPresentationalContent;
        }
        const cleanupErrors = this.rollbackNodes(runtime, container, output.nodes, invocation);
        if (cleanupErrors.length > 0) {
            throw new AggregateError(cleanupErrors, `${hookName} output became invalid and cleanup failed.`);
        }
        if (!this.options.isInvocationCurrent(runtime, controller)) {
            return false;
        }
        throw invalidCause;
    }
    /** Clears package topology captured for a previous render attempt. */
    beginRenderPass() {
        this.packageSkeletons.length = 0;
    }
    /** Seals prospective package children before their detached region is connected. */
    sealPackageSkeleton(region, expectedChildren, expectedAncestors, ownerDepth) {
        const ancestry = Object.freeze([region, ...expectedAncestors]);
        if (ancestry.at(-1) !== this.options.host || !hasExpectedAncestry(ancestry)) {
            throw new TypeError("A stable calendar render region was detached or reparented.");
        }
        for (const owner of getNodesAtDepth(expectedChildren, ownerDepth)) {
            this.sealPackageOwner(owner, region, expectedAncestors);
        }
        const entries = [];
        const contributors = new Map();
        this.capturePackageSkeleton(region, expectedChildren, entries, contributors);
        this.packageSkeletons.push(Object.freeze({
            ancestry,
            contributors,
            entries: Object.freeze(entries),
            stableShell: true
        }));
    }
    /** Revalidates output after detached render fragments have connected to the document. */
    getMountedValidationFailure(runtime) {
        for (const [node, expectedParent] of runtime.nodes) {
            const invocation = runtime.nodeInvocations.get(node);
            if (invocation === undefined) {
                return Object.freeze({
                    cause: new TypeError("Render-hook output lost its render ownership."),
                    hookName: "render",
                    surface: undefined
                });
            }
            if (node.parentNode !== expectedParent || this.nodeOwners.get(node) !== runtime ||
                !ownsNodeLease(node, runtime.leaseToken)) {
                return Object.freeze({
                    cause: new TypeError("Render-hook output must remain attached to its assigned slot while rendering."),
                    hookName: invocation.hookName,
                    surface: invocation.surface
                });
            }
            if (containsInteractiveContent(node)) {
                return Object.freeze({
                    cause: new TypeError("Render-hook output must remain noninteractive when mounted."),
                    hookName: invocation.hookName,
                    surface: invocation.surface
                });
            }
        }
        return null;
    }
    /** Returns the first sealed package tree changed during custom-element connection. */
    getPackageSkeletonValidationFailure() {
        for (const skeleton of this.packageSkeletons.filter((candidate) => candidate.stableShell)) {
            if (!hasExpectedAncestry(skeleton.ancestry)) {
                return Object.freeze({
                    cause: new TypeError("A stable calendar render region was detached or reparented."),
                    contributors: Object.freeze([]),
                    stableShellCorrupted: true
                });
            }
        }
        for (const skeleton of this.packageSkeletons) {
            const ancestryChanged = !hasExpectedAncestry(skeleton.ancestry);
            const childrenChanged = skeleton.entries.some((entry) => !hasExpectedChildren(entry));
            if (!ancestryChanged && !childrenChanged) {
                continue;
            }
            return Object.freeze({
                cause: new TypeError("Render-hook output must not add, remove, or reparent package-owned render nodes."),
                contributors: Object.freeze([...skeleton.contributors.values()].map((contributor) => resolveSkeletonContributor(contributor))),
                stableShellCorrupted: skeleton.stableShell && ancestryChanged
            });
        }
        return null;
    }
    sealPackageOwner(owner, region, expectedRegionAncestors) {
        const entries = [];
        const contributors = new Map();
        this.capturePackageSkeleton(owner, [...owner.childNodes], entries, contributors);
        if (contributors.size === 0) {
            return;
        }
        this.packageSkeletons.push(Object.freeze({
            ancestry: createProspectiveAncestry(owner, region, expectedRegionAncestors),
            contributors,
            entries: Object.freeze(entries),
            stableShell: false
        }));
    }
    /** Collects every runtime implicated by leased-node or package-skeleton validation. */
    getMountedValidationFailures(runtimes) {
        const failures = new Map();
        for (const runtime of runtimes) {
            if (runtime.quarantined) {
                continue;
            }
            try {
                const failure = this.getMountedValidationFailure(runtime);
                if (failure !== null) {
                    failures.set(runtime, Object.freeze({ ...failure, runtime }));
                }
            }
            catch (cause) {
                failures.set(runtime, Object.freeze({
                    cause,
                    hookName: "render",
                    runtime,
                    surface: undefined
                }));
            }
        }
        const skeletonFailure = this.getPackageSkeletonValidationFailure();
        if (skeletonFailure === null) {
            return Object.freeze([...failures.values()]);
        }
        if (skeletonFailure.stableShellCorrupted || skeletonFailure.contributors.length === 0) {
            throw skeletonFailure.cause;
        }
        for (const contributor of skeletonFailure.contributors) {
            if (!contributor.runtime.quarantined && !failures.has(contributor.runtime)) {
                failures.set(contributor.runtime, Object.freeze({
                    ...contributor,
                    cause: skeletonFailure.cause
                }));
            }
        }
        return Object.freeze([...failures.values()]);
    }
    resolveOutput(hookName, result) {
        if (!isSameDocumentNode(this.options.document, result) || !isAppendableNode(result)) {
            throw new TypeError(`${hookName} must return only appendable nodes owned by the host document.`);
        }
        if (result.parentNode !== null || result.contains(this.options.host) || hasNodeLease(result)) {
            throw new TypeError(`${hookName} must return a detached node that does not contain the calendar host.`);
        }
        const nodes = result.nodeType === 11 ? [...result.childNodes] : [result];
        for (const node of nodes) {
            if (!isSameDocumentNode(this.options.document, node) || !isAppendableNode(node) || hasNodeLease(node)) {
                throw new TypeError(`${hookName} returned a node that is invalid or already leased.`);
            }
            if (containsInteractiveContent(node)) {
                throw new TypeError(`${hookName} must return noninteractive content.`);
            }
        }
        return Object.freeze({
            hasPresentationalContent: nodes.some((node) => containsPresentationalContent(node)),
            nodes: Object.freeze(nodes)
        });
    }
    claimNodes(runtime, container, nodes, invocation) {
        for (const node of nodes) {
            setNodeLease(node, runtime.leaseToken);
            this.nodeOwners.set(node, runtime);
            runtime.nodeInvocations.set(node, invocation);
            runtime.nodes.set(node, container);
        }
    }
    capturePackageSkeleton(parent, children, entries, contributors) {
        const expectedChildren = Object.freeze([...children]);
        entries.push(Object.freeze({ children: expectedChildren, parent }));
        for (const child of expectedChildren) {
            const runtime = this.nodeOwners.get(child);
            const invocation = runtime?.nodeInvocations.get(child);
            if (runtime !== undefined && invocation !== undefined &&
                ownsNodeLease(child, runtime.leaseToken)) {
                let contributor = contributors.get(runtime);
                if (contributor === undefined) {
                    contributor = {
                        hookNames: new Set(),
                        runtime,
                        surfaces: new Set()
                    };
                    contributors.set(runtime, contributor);
                }
                contributor.hookNames.add(invocation.hookName);
                contributor.surfaces.add(invocation.surface);
                continue;
            }
            this.capturePackageSkeleton(child, [...child.childNodes], entries, contributors);
        }
    }
    getInvalidAppendCause(runtime, container, nodes, invocation) {
        const remainsAttached = nodes.every((node) => runtime.nodeInvocations.get(node) === invocation &&
            runtime.nodes.get(node) === container &&
            ownsNodeLease(node, runtime.leaseToken) &&
            node.parentNode === container);
        if (!remainsAttached) {
            return new TypeError(`${invocation.hookName} output must remain attached to its assigned slot.`);
        }
        return nodes.every((node) => !containsInteractiveContent(node))
            ? null
            : new TypeError(`${invocation.hookName} must return content that remains noninteractive when mounted.`);
    }
    rollbackNodes(runtime, container, nodes, invocation) {
        const cleanupErrors = [];
        for (const node of nodes) {
            if (runtime.nodeInvocations.get(node) !== invocation ||
                runtime.nodes.get(node) !== container ||
                !ownsNodeLease(node, runtime.leaseToken)) {
                continue;
            }
            runtime.nodeInvocations.delete(node);
            runtime.nodes.delete(node);
            try {
                if (node.parentNode === container) {
                    container.removeChild(node);
                }
            }
            catch (cause) {
                cleanupErrors.push(cause);
            }
            finally {
                releaseNodeLease(node, runtime.leaseToken);
            }
        }
        return cleanupErrors;
    }
    throwAppendFailure(runtime, container, nodes, invocation, hookName, cause) {
        const cleanupErrors = this.rollbackNodes(runtime, container, nodes, invocation);
        if (cleanupErrors.length > 0) {
            throw new AggregateError([cause, ...cleanupErrors], `${hookName} failed while appending render-hook content.`);
        }
        throw cause;
    }
}
function hasExpectedAncestry(ancestry) {
    for (let index = 0; index < ancestry.length - 1; index += 1) {
        if (ancestry[index]?.parentNode !== ancestry[index + 1]) {
            return false;
        }
    }
    return true;
}
function createProspectiveAncestry(owner, region, expectedRegionAncestors) {
    const ancestry = [owner];
    let ancestor = owner.parentNode;
    while (ancestor !== null && ancestor !== region) {
        ancestry.push(ancestor);
        ancestor = ancestor.parentNode;
    }
    ancestry.push(region, ...expectedRegionAncestors);
    return Object.freeze(ancestry);
}
function getNodesAtDepth(children, depth) {
    let nodes = [...children];
    for (let level = 1; level < depth; level += 1) {
        nodes = nodes.flatMap((node) => [...node.childNodes]);
    }
    return nodes;
}
function hasExpectedChildren(entry) {
    if (entry.parent.childNodes.length !== entry.children.length) {
        return false;
    }
    return entry.children.every((child, index) => entry.parent.childNodes.item(index) === child);
}
function resolveSkeletonContributor(contributor) {
    return Object.freeze({
        hookName: contributor.hookNames.size === 1
            ? contributor.hookNames.values().next().value ?? "render"
            : "render",
        runtime: contributor.runtime,
        surface: contributor.surfaces.size === 1
            ? contributor.surfaces.values().next().value
            : undefined
    });
}
//# sourceMappingURL=render-hook-nodes.js.map