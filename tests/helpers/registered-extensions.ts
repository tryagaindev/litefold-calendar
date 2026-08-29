import assert from "node:assert/strict";
import type { TestContext } from "node:test";

import type { Calendar } from "../../src/index.js";
import {
	createRegisteredExtension,
	type RegisteredExtensionActivationContext,
	type RegisteredExtensionCapability,
	type RegisteredExtensionInstance
} from "../../src/internal/runtime/registered-extension-contract.js";
import { createDom, installDom, waitFor } from "./dom.js";

export type RegisteredExtensionToken = ReturnType<typeof createRegisteredExtension>;

export interface RegisteredExtensionProbeDefinition {
	readonly activate?: (
		this: void,
		context: Readonly<RegisteredExtensionActivationContext>
	) => void | Readonly<RegisteredExtensionInstance>;
	readonly capabilities?: readonly RegisteredExtensionCapability[];
	readonly id: string;
}

export interface RegisteredExtensionTestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

/** Creates an authenticated package-owned extension token for coordinator contract tests. */
export function createRegisteredExtensionProbe(
	definition: Readonly<RegisteredExtensionProbeDefinition>
): RegisteredExtensionToken {
	return createRegisteredExtension({
		activate: definition.activate ?? (() => undefined),
		capabilities: definition.capabilities ?? [],
		id: definition.id
	});
}

/** Installs one isolated JSDOM calendar host for a unit test. */
export function setupRegisteredExtensionDom(
	context: TestContext,
	markup = '<div id="calendar"></div>'
): RegisteredExtensionTestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

/** Waits for a public calendar phase without relying on internal request scheduling. */
export async function waitForCalendarPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}

/** Lets queued extension state delivery and observed thenable rejection handlers drain. */
export async function flushRegisteredExtensionTasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}
