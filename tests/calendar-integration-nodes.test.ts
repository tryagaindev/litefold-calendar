import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	LitefoldCalendarError
} from "../src/index.js";
import { createDom, installDom, waitFor } from "./helpers/dom.js";

void test("destroy routes integration-node detach failures to onError as diagnostics", async (context) => {
	const errors: LitefoldCalendarError[] = [];
	const { calendar, detachFailure, host, toolbarEnd } = await setupDetachFailure(context, (error, activeCalendar) => {
		errors.push(error);
		activeCalendar.destroy();
		return undefined;
	});

	calendar.destroy();

	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.code, "host-integration-failed");
	assert.equal(errors[0]?.hook, "destroy");
	assert.equal(errors[0]?.phase, "destroy");
	assert.equal(errors[0]?.recoverable, false);
	assert.equal(errors[0]?.cause, detachFailure);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.deepEqual(calendar.getState().issues, []);
	assert.equal(host.childElementCount, 0);
	assert.equal(host.contains(toolbarEnd), false);
});

void test("a throwing detach diagnostic handler cannot interrupt destruction", async (context) => {
	const reported: unknown[] = [];
	const priorReporter = Object.getOwnPropertyDescriptor(globalThis, "reportError");
	Object.defineProperty(globalThis, "reportError", {
		configurable: true,
		value: (error: unknown) => { reported.push(error); }
	});
	context.after(() => {
		if (priorReporter === undefined) {
			Reflect.deleteProperty(globalThis, "reportError");
		} else {
			Object.defineProperty(globalThis, "reportError", priorReporter);
		}
	});
	const handlerFailure = new Error("diagnostic handler failed");
	const { calendar, host } = await setupDetachFailure(context, () => { throw handlerFailure; });

	assert.doesNotThrow(() => { calendar.destroy(); });

	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(reported.length, 1);
	const aggregate = reported[0];
	assert.ok(aggregate instanceof AggregateError);
	assert.ok(aggregate.errors.some((error) =>
		error instanceof LitefoldCalendarError && error.code === "host-integration-failed"));
	assert.ok(aggregate.errors.includes(handlerFailure));
});

type DetachErrorHandler = (
	error: LitefoldCalendarError,
	calendar: Calendar
) => "default" | "handled" | undefined;

interface DetachFailureFixture {
	readonly calendar: Calendar;
	readonly detachFailure: Error;
	readonly host: HTMLElement;
	readonly toolbarEnd: HTMLButtonElement;
}

async function setupDetachFailure(
	context: TestContext,
	onError: DetachErrorHandler
): Promise<DetachFailureFixture> {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	const toolbarEnd = dom.window.document.createElement("button");
	toolbarEnd.type = "button";
	toolbarEnd.textContent = "Application control";
	let calendar: Calendar | null = null;
	calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => {
			assert.ok(calendar);
			return onError(error, calendar);
		},
		toolbarEnd
	});
	calendar.render();
	await waitFor(() => calendar?.getState().phase === "ready", "ready calendar");
	const expectedParent = toolbarEnd.parentNode;
	assert.ok(expectedParent);
	const removeChild = expectedParent.removeChild.bind(expectedParent);
	const detachFailure = new Error("toolbar detach failed");
	Object.defineProperty(expectedParent, "removeChild", {
		configurable: true,
		value: (node: Node): Node => {
			if (node === toolbarEnd) {
				throw detachFailure;
			}
			return removeChild(node);
		}
	});
	return { calendar, detachFailure, host, toolbarEnd };
}
