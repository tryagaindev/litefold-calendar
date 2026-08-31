import assert from "node:assert/strict";
import type { TestContext } from "node:test";

import type {
	Calendar, CalendarEventInput, CalendarEventSource
} from "../../src/index.js";
import { createDom, deferred, installDom, waitFor } from "./dom.js";

export interface CapturedTool {
	readonly annotations?: Readonly<{
		readonly readOnlyHint?: boolean;
		readonly untrustedContentHint?: boolean;
	}>;
	readonly description: string;
	readonly execute: (
		this: void,
		input: unknown,
		options?: unknown
	) => Promise<unknown>;
	readonly inputSchema?: unknown;
	readonly name: string;
	readonly title?: string;
}

interface CapturedRegistration {
	readonly options: Readonly<{ readonly signal?: AbortSignal }>;
	readonly tool: CapturedTool;
}

export interface SourceRequest {
	readonly pending: ReturnType<typeof deferred<readonly CalendarEventInput[]>>;
	readonly signal: AbortSignal;
}

export class TestModelContext {
	public readonly activeTools = new Map<string, CapturedTool>();
	public readonly registrations: CapturedRegistration[] = [];

	public constructor(
		private readonly failingRegistration: number | null = null,
		private readonly rejectDuplicateNames = false
	) {}

	public async registerTool(
		tool: CapturedTool,
		options: Readonly<{ readonly signal?: AbortSignal }> = {}
	): Promise<void> {
		this.registrations.push({ options, tool });
		const registrationNumber = this.registrations.length;
		if (this.rejectDuplicateNames && this.activeTools.has(tool.name)) {
			throw new DOMException("A tool with this name is already registered", "InvalidStateError");
		}
		if (registrationNumber === this.failingRegistration) {
			throw new DOMException("Registration rejected", "NotAllowedError");
		}
		if (options.signal?.aborted === true) {
			throw new DOMException("Registration aborted", "AbortError");
		}
		this.activeTools.set(tool.name, tool);
		options.signal?.addEventListener("abort", () => {
			this.activeTools.delete(tool.name);
		}, { once: true });
	}
}

export function createDeferredEventSource(requests: SourceRequest[]): CalendarEventSource {
	return ({ signal }) => {
		const pending = deferred<readonly CalendarEventInput[]>();
		requests.push({ pending, signal });
		return pending.promise;
	};
}

export function setupDom(
	context: TestContext,
	modelContext?: TestModelContext,
	markup = '<div id="calendar"></div>'
): Readonly<{ readonly dom: ReturnType<typeof createDom>; readonly host: HTMLElement }> {
	const dom = createDom(markup);
	if (modelContext !== undefined) {
		Object.defineProperty(dom.window.document, "modelContext", {
			configurable: true,
			value: modelContext
		});
	}
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

export function createPrivateEvents(
	count: number
): readonly CalendarEventInput<Readonly<{ secret: string }>>[] {
	return Array.from({ length: count }, (_, index) => {
		const number = index + 1;
		const hour = number + 8;
		const startHour = hour.toString().padStart(2, "0");
		const endHour = hour.toString().padStart(2, "0");
		return {
			accentColor: "#123456",
			end: `2026-07-14T${endHour}:30`,
			id: `event-${index.toString()}`,
			metadata: { secret: `secret-${index.toString()}` },
			start: `2026-07-14T${startHour}:00`,
			title: `Visible event ${number.toString().padStart(2, "0")}`,
			url: `https://private.example/events/${index.toString()}`
		};
	});
}

export async function waitForRegistrations(
	modelContext: TestModelContext,
	expectedCount = 2
): Promise<void> {
	await waitFor(
		() => modelContext.registrations.length === expectedCount,
		"WebMCP tool registration"
	);
}

export function findTool(modelContext: TestModelContext, name: string): CapturedTool {
	const registration = modelContext.registrations.find(({ tool }) => tool.name === name);
	assert.ok(registration, `Expected ${name} to be registered.`);
	return registration.tool;
}

export function executeTool(
	tool: CapturedTool,
	input: unknown,
	signal = new AbortController().signal
): Promise<unknown> {
	return tool.execute(input, { signal });
}

export function requireRecord(value: unknown): Record<string, unknown> {
	assert.equal(typeof value, "object");
	assert.ok(value !== null);
	assert.equal(Array.isArray(value), false);
	return value as Record<string, unknown>;
}

export function requireRecords(value: unknown): readonly Record<string, unknown>[] {
	assert.ok(Array.isArray(value));
	return value.map((entry) => requireRecord(entry));
}

export function assertErrorEnvelope(value: unknown, code: string): void {
	const result = requireRecord(value);
	const error = requireRecord(result["error"]);
	assert.equal(result["ok"], false);
	assert.equal(error["code"], code);
	assert.equal(typeof error["message"], "string");
	assert.equal((error["message"] as string).length > 0, true);
	requireRecord(result["state"]);
}

export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

export async function waitForPhase<TMetadata>(
	calendar: Calendar<TMetadata>,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
