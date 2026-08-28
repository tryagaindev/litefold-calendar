import type { ExtensionNodeInvocation, ExtensionRuntime } from "./extensions.js";
import {
	hasNodeLease, ownsNodeLease, releaseNodeLease, setNodeLease
} from "./node-leases.js";
import {
	containsInteractiveContent, containsPresentationalContent, isAppendableNode, isSameDocumentNode
} from "./safety.js";

interface ExtensionNodeRendererOptions<TMetadata> {
	readonly document: Document;
	readonly host: HTMLElement;
	readonly isInvocationCurrent: (
		runtime: ExtensionRuntime<TMetadata>,
		controller: AbortController
	) => boolean;
}

/** Describes mounted extension output that no longer satisfies its render contract. */
export interface InvalidMountedExtensionNode {
	readonly cause: TypeError;
	readonly hookName: string;
}

interface ResolvedExtensionOutput {
	readonly hasPresentationalContent: boolean;
	readonly nodes: readonly Node[];
}

/** Owns extension-node validation, leasing, append rollback, and mounted revalidation. */
export class ExtensionNodeRenderer<TMetadata> {
	private readonly options: Readonly<ExtensionNodeRendererOptions<TMetadata>>;

	public constructor(options: Readonly<ExtensionNodeRendererOptions<TMetadata>>) {
		this.options = options;
	}

	/** Appends one synchronous extension result and returns whether it supplies visual content. */
	public append(
		runtime: ExtensionRuntime<TMetadata>,
		hookName: string,
		container: HTMLElement,
		result: unknown,
		requirePresentationalContent = false
	): boolean {
		const controller = runtime.controller;
		const output = this.resolveOutput(hookName, result);
		if (requirePresentationalContent && !output.hasPresentationalContent) {
			return false;
		}
		if (!this.options.isInvocationCurrent(runtime, controller)) {
			return false;
		}
		const invocation = Object.freeze({ controller, hookName });
		this.claimNodes(runtime, container, output.nodes, invocation);
		try {
			container.append(result as Node);
		} catch (cause: unknown) {
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

	/** Revalidates output after detached render fragments have connected to the document. */
	public getMountedValidationFailure(
		runtime: ExtensionRuntime<TMetadata>
	): Readonly<InvalidMountedExtensionNode> | null {
		for (const [node, expectedParent] of runtime.nodes) {
			const invocation = runtime.nodeInvocations.get(node);
			if (invocation === undefined) {
				return Object.freeze({
					cause: new TypeError("Extension output lost its render ownership."),
					hookName: "render"
				});
			}
			if (node.parentNode !== expectedParent || !ownsNodeLease(node, runtime.leaseToken)) {
				return Object.freeze({
					cause: new TypeError(
						"Extension output must remain attached to its assigned slot while rendering."
					),
					hookName: invocation.hookName
				});
			}
			if (containsInteractiveContent(node)) {
				return Object.freeze({
					cause: new TypeError("Extension output must remain noninteractive when mounted."),
					hookName: invocation.hookName
				});
			}
		}
		return null;
	}

	private resolveOutput(hookName: string, result: unknown): Readonly<ResolvedExtensionOutput> {
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

	private claimNodes(
		runtime: ExtensionRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<ExtensionNodeInvocation>
	): void {
		for (const node of nodes) {
			setNodeLease(node, runtime.leaseToken);
			runtime.nodeInvocations.set(node, invocation);
			runtime.nodes.set(node, container);
		}
	}

	private getInvalidAppendCause(
		runtime: ExtensionRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<ExtensionNodeInvocation>
	): TypeError | null {
		const remainsAttached = nodes.every((node) =>
			runtime.nodeInvocations.get(node) === invocation &&
			runtime.nodes.get(node) === container &&
			ownsNodeLease(node, runtime.leaseToken) &&
			node.parentNode === container);
		if (!remainsAttached) {
			return new TypeError(`${invocation.hookName} output must remain attached to its assigned slot.`);
		}
		return nodes.every((node) => !containsInteractiveContent(node))
			? null
			: new TypeError(
				`${invocation.hookName} must return content that remains noninteractive when mounted.`
			);
	}

	private rollbackNodes(
		runtime: ExtensionRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<ExtensionNodeInvocation>
	): unknown[] {
		const cleanupErrors: unknown[] = [];
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
			} catch (cause: unknown) {
				cleanupErrors.push(cause);
			} finally {
				releaseNodeLease(node, runtime.leaseToken);
			}
		}
		return cleanupErrors;
	}

	private throwAppendFailure(
		runtime: ExtensionRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<ExtensionNodeInvocation>,
		hookName: string,
		cause: unknown
	): never {
		const cleanupErrors = this.rollbackNodes(runtime, container, nodes, invocation);
		if (cleanupErrors.length > 0) {
			throw new AggregateError(
				[cause, ...cleanupErrors],
				`${hookName} failed while appending extension content.`
			);
		}
		throw cause;
	}
}
