import type { RenderHookNodeInvocation, RenderHookRuntime } from "./render-hooks.js";
import {
	hasNodeLease, ownsNodeLease, releaseNodeLease, setNodeLease
} from "./node-leases.js";
import {
	containsInteractiveContent, containsPresentationalContent, isAppendableNode, isSameDocumentNode
} from "./safety.js";
import {
	assertRenderHookElementIntegrity,
	captureRenderHookNodeValueIntegrity,
	hasRenderHookNodeValueIntegrity,
	type RenderHookNodeValueIntegritySnapshot
} from "./render-hook-element-integrity.js";

interface RenderHookNodeRendererOptions<TMetadata> {
	readonly document: Document;
	readonly enabled: boolean;
	readonly host: HTMLElement;
	readonly isInvocationCurrent: (
		runtime: RenderHookRuntime<TMetadata>,
		controller: AbortController
	) => boolean;
}

/** Describes mounted render-hook output that no longer satisfies its render contract. */
export interface InvalidMountedRenderHookNode {
	readonly cause: TypeError;
	readonly hookName: string;
	readonly surface: unknown;
}

/** Identifies a render-hook runtime that could have corrupted a sealed package-owned tree. */
export interface RenderHookSkeletonContributor<TMetadata> {
	readonly hookName: string;
	readonly runtime: RenderHookRuntime<TMetadata>;
	readonly surface: unknown;
}

/** Describes one runtime that must be quarantined after mounted validation. */
export interface RenderHookValidationFailure<TMetadata> extends RenderHookSkeletonContributor<TMetadata> {
	readonly cause: unknown;
}

/** Describes a sealed package-owned tree that changed after render-hook output connected. */
export interface InvalidMountedRenderHookSkeleton<TMetadata> {
	readonly cause: TypeError;
	readonly contributors: readonly Readonly<RenderHookSkeletonContributor<TMetadata>>[];
	readonly stableShellCorrupted: boolean;
}

interface ResolvedRenderHookOutput {
	readonly hasPresentationalContent: boolean;
	readonly nodes: readonly Node[];
}

interface PackageSkeletonEntry {
	readonly children: readonly Node[];
	readonly parent: Node;
	readonly valueIntegrity: Readonly<RenderHookNodeValueIntegritySnapshot>;
}

interface PackageSkeletonContributor<TMetadata> {
	readonly hookNames: Set<string>;
	readonly runtime: RenderHookRuntime<TMetadata>;
	readonly surfaces: Set<unknown>;
}

interface PackageSkeleton<TMetadata> {
	readonly ancestry: readonly Node[];
	readonly contributors: ReadonlyMap<RenderHookRuntime<TMetadata>, PackageSkeletonContributor<TMetadata>>;
	readonly entries: readonly Readonly<PackageSkeletonEntry>[];
	readonly stableShell: boolean;
}

/** Owns render-hook node validation, leasing, append rollback, and mounted revalidation. */
export class RenderHookNodeRenderer<TMetadata> {
	private readonly nodeOwners = new WeakMap<Node, RenderHookRuntime<TMetadata>>();
	private readonly options: Readonly<RenderHookNodeRendererOptions<TMetadata>>;
	private readonly packageSkeletons: PackageSkeleton<TMetadata>[] = [];

	public constructor(options: Readonly<RenderHookNodeRendererOptions<TMetadata>>) {
		this.options = options;
	}

	/** Appends one synchronous render-hook result and returns whether it supplies visual content. */
	public append(
		runtime: RenderHookRuntime<TMetadata>,
		hookName: string,
		container: HTMLElement,
		result: unknown,
		requirePresentationalContent = false,
		surface?: unknown
	): boolean {
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

	/** Clears package topology captured for a previous render attempt. */
	public beginRenderPass(): void {
		this.packageSkeletons.length = 0;
	}

	/** Seals prospective package children before their detached region is connected. */
	public sealPackageSkeleton(
		region: Node,
		expectedChildren: readonly Node[],
		expectedAncestors: readonly Node[],
		ownerDepth: number
	): void {
		if (!this.options.enabled) {
			return;
		}
		const ancestry = Object.freeze([region, ...expectedAncestors]);
		if (ancestry.at(-1) !== this.options.host || !hasExpectedAncestry(ancestry)) {
			throw new TypeError("A stable calendar render region was detached or reparented.");
		}
		for (const owner of getNodesAtDepth(expectedChildren, ownerDepth)) {
			this.sealPackageOwner(owner, region, expectedAncestors);
		}
		const entries: PackageSkeletonEntry[] = [];
		const contributors = new Map<
			RenderHookRuntime<TMetadata>,
			PackageSkeletonContributor<TMetadata>
		>();
		this.capturePackageSkeleton(region, expectedChildren, entries, contributors);
		this.packageSkeletons.push(Object.freeze({
			ancestry,
			contributors,
			entries: Object.freeze(entries),
			stableShell: true
		}));
	}

	/** Revalidates output after detached render fragments have connected to the document. */
	public getMountedValidationFailure(
		runtime: RenderHookRuntime<TMetadata>
	): Readonly<InvalidMountedRenderHookNode> | null {
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
					cause: new TypeError(
						"Render-hook output must remain attached to its assigned slot while rendering."
					),
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
		for (const fallback of runtime.eventOverflowFallbacks.values()) {
			if (fallback.detachedPackageIntegrity === null) {
				continue;
			}
			try {
				assertRenderHookElementIntegrity(
					fallback.detachedPackageIntegrity,
					"renderEventOverflow"
				);
			} catch (cause: unknown) {
				return Object.freeze({
					cause: cause instanceof TypeError ? cause : new TypeError(
						"Detached package-owned overflow content could not be validated.",
						{ cause }
					),
					hookName: "renderEventOverflow",
					surface: fallback.surface
				});
			}
		}
		return null;
	}

	/** Returns the first sealed package tree changed during custom-element connection. */
	public getPackageSkeletonValidationFailure():
		Readonly<InvalidMountedRenderHookSkeleton<TMetadata>> | null {
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
			const valuesChanged = skeleton.entries.some((entry) =>
				!hasRenderHookNodeValueIntegrity(entry.parent, entry.valueIntegrity));
			if (!ancestryChanged && !childrenChanged && !valuesChanged) {
				continue;
			}
			return Object.freeze({
				cause: createPackageSkeletonMutationError(
					ancestryChanged,
					childrenChanged,
					valuesChanged
				),
				contributors: Object.freeze([...skeleton.contributors.values()].map((contributor) =>
					resolveSkeletonContributor(contributor))),
				stableShellCorrupted: skeleton.stableShell && ancestryChanged
			});
		}
		return null;
	}

	private sealPackageOwner(
		owner: Node,
		region: Node,
		expectedRegionAncestors: readonly Node[]
	): void {
		const entries: PackageSkeletonEntry[] = [];
		const contributors = new Map<
			RenderHookRuntime<TMetadata>,
			PackageSkeletonContributor<TMetadata>
		>();
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
	public getMountedValidationFailures(
		runtimes: readonly RenderHookRuntime<TMetadata>[]
	): readonly Readonly<RenderHookValidationFailure<TMetadata>>[] {
		if (!this.options.enabled) {
			return Object.freeze([]);
		}
		const failures = new Map<RenderHookRuntime<TMetadata>, RenderHookValidationFailure<TMetadata>>();
		for (const runtime of runtimes) {
			if (runtime.quarantined) {
				continue;
			}
			try {
				const failure = this.getMountedValidationFailure(runtime);
				if (failure !== null) {
					failures.set(runtime, Object.freeze({ ...failure, runtime }));
				}
			} catch (cause: unknown) {
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

	private resolveOutput(hookName: string, result: unknown): Readonly<ResolvedRenderHookOutput> {
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
		runtime: RenderHookRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<RenderHookNodeInvocation>
	): void {
		for (const node of nodes) {
			setNodeLease(node, runtime.leaseToken);
			this.nodeOwners.set(node, runtime);
			runtime.nodeInvocations.set(node, invocation);
			runtime.nodes.set(node, container);
		}
	}

	private capturePackageSkeleton(
		parent: Node,
		children: readonly Node[],
		entries: PackageSkeletonEntry[],
		contributors: Map<RenderHookRuntime<TMetadata>, PackageSkeletonContributor<TMetadata>>
	): void {
		const expectedChildren = Object.freeze([...children]);
		entries.push(Object.freeze({
			children: expectedChildren,
			parent,
			valueIntegrity: captureRenderHookNodeValueIntegrity(parent)
		}));
		for (const child of expectedChildren) {
			const runtime = this.nodeOwners.get(child);
			const invocation = runtime?.nodeInvocations.get(child);
			if (runtime !== undefined && invocation !== undefined &&
				ownsNodeLease(child, runtime.leaseToken)) {
				let contributor = contributors.get(runtime);
				if (contributor === undefined) {
					contributor = {
						hookNames: new Set<string>(),
						runtime,
						surfaces: new Set<unknown>()
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

	private getInvalidAppendCause(
		runtime: RenderHookRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<RenderHookNodeInvocation>
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
		runtime: RenderHookRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<RenderHookNodeInvocation>
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
		runtime: RenderHookRuntime<TMetadata>,
		container: HTMLElement,
		nodes: readonly Node[],
		invocation: Readonly<RenderHookNodeInvocation>,
		hookName: string,
		cause: unknown
	): never {
		const cleanupErrors = this.rollbackNodes(runtime, container, nodes, invocation);
		if (cleanupErrors.length > 0) {
			throw new AggregateError(
				[cause, ...cleanupErrors],
				`${hookName} failed while appending render-hook content.`
			);
		}
		throw cause;
	}
}

function hasExpectedAncestry(ancestry: readonly Node[]): boolean {
	for (let index = 0; index < ancestry.length - 1; index += 1) {
		if (ancestry[index]?.parentNode !== ancestry[index + 1]) {
			return false;
		}
	}
	return true;
}

function createProspectiveAncestry(
	owner: Node,
	region: Node,
	expectedRegionAncestors: readonly Node[]
): readonly Node[] {
	const ancestry: Node[] = [owner];
	let ancestor = owner.parentNode;
	while (ancestor !== null && ancestor !== region) {
		ancestry.push(ancestor);
		ancestor = ancestor.parentNode;
	}
	ancestry.push(region, ...expectedRegionAncestors);
	return Object.freeze(ancestry);
}

function getNodesAtDepth(children: readonly Node[], depth: number): readonly Node[] {
	let nodes = [...children];
	for (let level = 1; level < depth; level += 1) {
		nodes = nodes.flatMap((node) => [...node.childNodes]);
	}
	return nodes;
}

function hasExpectedChildren(entry: Readonly<PackageSkeletonEntry>): boolean {
	if (entry.parent.childNodes.length !== entry.children.length) {
		return false;
	}
	return entry.children.every((child, index) => entry.parent.childNodes.item(index) === child);
}

function createPackageSkeletonMutationError(
	ancestryChanged: boolean,
	childrenChanged: boolean,
	valuesChanged: boolean
): TypeError {
	if (valuesChanged && !ancestryChanged && !childrenChanged) {
		return new TypeError(
			"Render-hook output must not change package-owned render attributes or text when mounted."
		);
	}
	if (!valuesChanged) {
		return new TypeError(
			"Render-hook output must not add, remove, or reparent package-owned render nodes."
		);
	}
	return new TypeError(
		"Render-hook output must not change package-owned render attributes, text, or topology when mounted."
	);
}

function resolveSkeletonContributor<TMetadata>(
	contributor: Readonly<PackageSkeletonContributor<TMetadata>>
): Readonly<RenderHookSkeletonContributor<TMetadata>> {
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
