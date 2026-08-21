import { reportCalendarError } from "../../errors.js";
import type { LitefoldCalendarError } from "../../errors.js";
import { isAppendableNode, isSameDocumentNode } from "./safety.js";
import {
	hasNodeLease,
	ownsNodeLease,
	releaseNodeLease,
	setNodeLease
} from "./node-leases.js";

interface IntegrationNodeControllerOptions {
	readonly createDetachError: (cause: unknown) => LitefoldCalendarError;
	readonly createLeaseError: () => LitefoldCalendarError;
	readonly document: Document;
	readonly fallbackElement: HTMLElement | null;
	readonly host: HTMLElement;
	readonly iconNodes: Readonly<Record<"next" | "previous", Node>>;
	readonly toolbarEnd: HTMLElement | null;
}

/** Owns reversible leases for application nodes integrated with one calendar instance. */
export class IntegrationNodeController {
	public readonly parents = new Map<Node, Node>();

	private fallbackLastWrittenHidden: HTMLElement["hidden"] | null = null;
	private fallbackWasHidden: HTMLElement["hidden"] | null = null;
	private readonly leasedNodes = new Set<Node>();
	private readonly leaseToken: object = {};

	public constructor(private readonly options: Readonly<IntegrationNodeControllerOptions>) {}

	/** Claims all configured integration nodes atomically. */
	public claim(): void {
		const nodes = [
			this.options.iconNodes.previous,
			this.options.iconNodes.next,
			this.options.toolbarEnd,
			this.options.fallbackElement
		].filter((node): node is Node => node !== null);
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
	public updateFallback(hasCurrentSnapshot: boolean, hasFatalError: boolean): void {
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
	public restoreFallback(): void {
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
	public detachMountedNodes(): void {
		for (const [node, expectedParent] of this.parents) {
			if (!ownsNodeLease(node, this.leaseToken) || node.parentNode !== expectedParent) {
				continue;
			}
			try {
				expectedParent.removeChild(node);
			} catch (cause: unknown) {
				reportCalendarError(this.options.createDetachError(cause));
			}
		}
	}

	/** Releases every lease still owned by this controller. */
	public release(): void {
		for (const node of this.leasedNodes) {
			releaseNodeLease(node, this.leaseToken);
		}
		this.leasedNodes.clear();
		this.parents.clear();
	}

	private canClaim(node: Node): boolean {
		const isToolbar = node === this.options.toolbarEnd;
		const isFallback = node === this.options.fallbackElement;
		const hasAllowedParent = isFallback
			? !this.options.host.contains(node) && !node.contains(this.options.host)
			: node.parentNode === null || (isToolbar && this.options.host.contains(node));
		return isSameDocumentNode(this.options.document, node) && isAppendableNode(node) && hasAllowedParent &&
			node !== this.options.host && !node.contains(this.options.host) && !hasNodeLease(node);
	}
}
