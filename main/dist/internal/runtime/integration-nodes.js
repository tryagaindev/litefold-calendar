import { isAppendableNode, isSameDocumentNode } from "./safety.js";
import { hasNodeLease, ownsNodeLease, releaseNodeLease, setNodeLease } from "./node-leases.js";
/** Owns reversible leases for application nodes integrated with one calendar instance. */
export class IntegrationNodeController {
    options;
    parents = new Map();
    fallbackLastWrittenHidden = null;
    fallbackWasHidden = null;
    leasedNodes = new Set();
    leaseToken = {};
    constructor(options) {
        this.options = options;
    }
    /** Claims all configured integration nodes atomically. */
    claim() {
        const nodes = [
            this.options.iconNodes.previous,
            this.options.iconNodes.next,
            this.options.toolbarEnd,
            this.options.fallbackElement
        ].filter((node) => node !== null);
        for (const node of nodes) {
            if (!this.canClaim(node)) {
                this.release();
                throw this.options.createLeaseError();
            }
            setNodeLease(node, this.leaseToken);
            this.leasedNodes.add(node);
        }
        this.fallbackWasHidden = this.options.fallbackElement?.hidden ?? null;
        this.fallbackLastWrittenHidden = this.fallbackWasHidden;
    }
    /** Hides fallback content only after a usable snapshot is committed. */
    updateFallback(hasCurrentSnapshot, hasFatalError) {
        const fallback = this.options.fallbackElement;
        if (fallback === null || this.fallbackWasHidden === null ||
            !ownsNodeLease(fallback, this.leaseToken) || this.fallbackLastWrittenHidden === null ||
            fallback.hidden !== this.fallbackLastWrittenHidden) {
            return;
        }
        const hidden = hasCurrentSnapshot && !hasFatalError ? true : this.fallbackWasHidden;
        fallback.hidden = hidden;
        this.fallbackLastWrittenHidden = hidden;
    }
    /** Restores fallback visibility without overwriting application mutation. */
    restoreFallback() {
        const fallback = this.options.fallbackElement;
        if (fallback !== null && this.fallbackWasHidden !== null &&
            this.fallbackLastWrittenHidden !== null && ownsNodeLease(fallback, this.leaseToken) &&
            fallback.hidden === this.fallbackLastWrittenHidden) {
            fallback.hidden = this.fallbackWasHidden;
        }
        this.fallbackLastWrittenHidden = null;
        this.fallbackWasHidden = null;
    }
    /** Detaches package-mounted nodes that have not been moved by the application. */
    detachMountedNodes() {
        for (const [node, expectedParent] of this.parents) {
            if (!ownsNodeLease(node, this.leaseToken) || node.parentNode !== expectedParent) {
                continue;
            }
            try {
                expectedParent.removeChild(node);
            }
            catch (cause) {
                this.options.reportDetachError(this.options.createDetachError(cause));
            }
        }
    }
    /** Releases every lease still owned by this controller. */
    release() {
        for (const node of this.leasedNodes) {
            releaseNodeLease(node, this.leaseToken);
        }
        this.leasedNodes.clear();
        this.parents.clear();
    }
    canClaim(node) {
        const isToolbar = node === this.options.toolbarEnd;
        const isFallback = node === this.options.fallbackElement;
        const hasAllowedParent = isFallback
            ? !this.options.host.contains(node) && !node.contains(this.options.host)
            : node.parentNode === null || (isToolbar && this.options.host.contains(node));
        return isSameDocumentNode(this.options.document, node) && isAppendableNode(node) && hasAllowedParent &&
            node !== this.options.host && !node.contains(this.options.host) && !hasNodeLease(node);
    }
}
//# sourceMappingURL=integration-nodes.js.map