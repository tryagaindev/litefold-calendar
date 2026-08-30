import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarEventOverflowContext,
	type LitefoldCalendarError
} from "../src/index.js";
import { createDom, installDom, waitFor } from "./helpers/dom.js";

type OverflowPackageMutation = "append interactive content" | "change the action label" | "remove the root";

for (const mutation of [
	"remove the root",
	"change the action label",
	"append interactive content"
] as const satisfies readonly OverflowPackageMutation[]) {
	void test(`renderEventOverflow cannot ${mutation} on package-owned elements`, async (context) => {
		const { host } = setupDom(context);
		const errors: LitefoldCalendarError[] = [];
		let originalActionLabel: string | null = null;
		const calendar = createCalendar(host, {
			events: eventsForDate("2026-07-14", 2, `package-mutation-${mutation}`),
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1,
			onError: (error) => { errors.push(error); },
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `package-mutation-${mutation}`,
				renderEventOverflow: (renderContext) => {
					if (renderContext.variant === "compact") {
						const custom = renderContext.document.createElement("span");
						custom.className = "temporary-compact-overflow";
						custom.textContent = "Temporary";
						return custom;
					}
					originalActionLabel = renderContext.elements.action.getAttribute("aria-label");
					mutateWideOverflowPackage(renderContext, mutation);
					return undefined;
				}
			}]
		});

		calendar.render();
		await waitForPhase(calendar, "degraded");

		assert.ok(errors.some((error) =>
			error.hook === "renderEventOverflow" && error.surface === "grid-summary"));
		assert.equal(host.querySelector(".temporary-compact-overflow"), null);
		assert.equal(host.querySelector(".overflow-package-intruder"), null);
		assertDefaultOverflowVariants(host, "2026-07-14");
		const action = getGridOverflowButton(host, "2026-07-14");
		assert.equal(action.getAttribute("aria-label"), originalActionLabel);
		assert.equal(action.querySelectorAll(":scope > .lfc-calendar-event-overflow.lfc-is-wide").length, 1);
	});
}

for (const mutation of ["remove cluster", "mutate summaries", "mutate day cell"] as const) {
	void test(`passive compact renderEventOverflow cannot ${mutation}`, async (context) => {
		const { host } = setupDom(context);
		const errors: LitefoldCalendarError[] = [];
		let placementReached = false;
		const calendar = createCalendar(host, {
			events: eventsForDate("2026-07-14", 2, `compact-placement-${mutation}`),
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1,
			onError: (error) => { errors.push(error); },
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `compact-placement-${mutation}`,
				renderEventOverflow: (renderContext) => {
					if (renderContext.variant !== "compact") {
						return undefined;
					}
					const cluster = renderContext.elements.root.parentElement;
					if (cluster?.classList.contains("lfc-calendar-event-overflow-cluster") !== true) {
						return undefined;
					}
					placementReached = true;
					if (mutation === "remove cluster") {
						cluster.remove();
					} else if (mutation === "mutate summaries") {
						cluster.parentElement?.setAttribute("data-compact-placement-corrupted", "true");
					} else {
						cluster.parentElement?.parentElement?.setAttribute(
							"data-compact-placement-corrupted",
							"true"
						);
					}
					return undefined;
				}
			}]
		});

		calendar.render();
		await waitForPhase(calendar, "degraded");

		assert.equal(placementReached, true);
		assert.equal(errors.length, 1);
		assert.equal(errors[0]?.hook, "renderEventOverflow");
		assert.equal(errors[0]?.surface, "day");
		const compact = getCompactOverflowRoot(host, "2026-07-14");
		assert.equal(getOverflowContent(compact).textContent, "+1");
		assert.equal(
			compact.parentElement?.classList.contains("lfc-calendar-event-overflow-cluster"),
			true
		);
		assert.equal(host.querySelector("[data-compact-placement-corrupted]"), null);
	});
}

for (const mutation of ["overflow attributes", "fallback text node value"] as const) {
	void test(`connected overflow output cannot mutate ${mutation}`, async (context) => {
		const { dom, host } = setupDom(context);
		let mutatePackageElements: (() => void) | null = null;
		const tagName = mutation === "overflow attributes"
			? "lfc-connected-overflow-attribute-mutator"
			: "lfc-connected-overflow-text-mutator";
		class ConnectedOverflowMutator extends dom.window.HTMLElement {
			public connectedCallback(): void {
				mutatePackageElements?.();
			}
		}
		dom.window.customElements.define(tagName, ConnectedOverflowMutator);
		const errors: LitefoldCalendarError[] = [];
		let originalActionLabel: string | null = null;
		let packageTextReached = false;
		const calendar = createCalendar(host, {
			events: eventsForDate("2026-07-14", 2, `connected-${mutation}`),
			initialDate: "2026-07-14",
			maxGridEventsPerDay: 1,
			onError: (error) => { errors.push(error); },
			onEventActivate: () => undefined,
			renderHooks: [{
				id: `connected-${mutation}`,
				renderEventOverflow: (renderContext) => {
					if (renderContext.variant !== "wide") {
						return undefined;
					}
					const { action, content, root } = renderContext.elements;
					originalActionLabel = action.getAttribute("aria-label");
					const packageText = content.querySelector(
						".lfc-event-overflow-default-content"
					)?.firstChild;
					if (packageText === null || packageText === undefined) {
						return undefined;
					}
					packageTextReached = true;
					mutatePackageElements = mutation === "overflow attributes"
						? () => {
							action.setAttribute("data-connected-corruption", "action");
							root.setAttribute("data-connected-corruption", "root");
							content.setAttribute("data-connected-corruption", "content");
						}
						: () => { packageText.nodeValue = "Connected corruption"; };
					return renderContext.document.createElement(tagName);
				}
			}]
		});

		calendar.render();
		await waitForPhase(calendar, "degraded");

		assert.equal(packageTextReached, true);
		assert.equal(errors.length, 1);
		assert.equal(errors[0]?.hook, "renderEventOverflow");
		assert.equal(errors[0]?.surface, "grid-summary");
		assert.equal(host.querySelector(tagName), null);
		assert.equal(host.querySelector("[data-connected-corruption]"), null);
		assertDefaultOverflowVariants(host, "2026-07-14");
		assert.equal(
			getGridOverflowButton(host, "2026-07-14").getAttribute("aria-label"),
			originalActionLabel
		);
	});
}

void test("later event hooks may mutate earlier consumer-owned output", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	let earlierOutput: HTMLElement | null = null;
	const calendar = createCalendar(host, {
		events: [event("consumer-owned", "2026-07-14T09:00", "Consumer owned")],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		renderHooks: [
			{
				id: "earlier-consumer-owner",
				renderEventLeading: ({ document: ownerDocument }) => {
					earlierOutput = ownerDocument.createElement("span");
					earlierOutput.className = "earlier-consumer-output";
					earlierOutput.textContent = "Earlier";
					return earlierOutput;
				}
			},
			{
				id: "later-consumer-mutator",
				renderEventLeading: ({ document: ownerDocument }) => {
					assert.ok(earlierOutput);
					earlierOutput.dataset["laterMutation"] = "accepted";
					const earlierText = earlierOutput.firstChild;
					assert.ok(earlierText);
					earlierText.nodeValue = "Updated by later hook";
					const output = ownerDocument.createElement("span");
					output.className = "later-consumer-output";
					return output;
				}
			}
		]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(errors, []);
	const earlierOutputs = [...host.querySelectorAll<HTMLElement>(".earlier-consumer-output")];
	assert.equal(earlierOutputs.length, 2);
	assert.ok(earlierOutputs.every((output) =>
		output.dataset["laterMutation"] === "accepted" &&
		output.textContent === "Updated by later hook"));
	assert.equal(host.querySelectorAll(".later-consumer-output").length, 2);
});

void test("native grid-overflow activation precedes action-backed compact consumer listeners", async (context) => {
	const { dom, host } = setupDom(context);
	let consumerClicks = 0;
	let consumerKeydowns = 0;
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-15", 2, "listener-order"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 0,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "grid-overflow-listener-order",
			renderEventOverflow: ({ elements, variant }) => {
				if (variant === "compact" && elements.action !== null) {
					elements.action.addEventListener("click", (event) => {
						consumerClicks += 1;
						event.stopImmediatePropagation();
					}, { capture: true });
					elements.action.addEventListener("keydown", (event) => {
						consumerKeydowns += 1;
						event.stopImmediatePropagation();
					}, { capture: true });
				}
				return undefined;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	const overflowAction = getGridOverflowButton(host, "2026-07-15");
	overflowAction.focus();
	overflowAction.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		key: "F2"
	}));
	assert.equal(consumerKeydowns, 1);
	assert.equal(
		dom.window.document.activeElement,
		host.querySelector(".lfc-calendar-day-button[data-lfc-date='2026-07-15']")
	);

	overflowAction.click();

	assert.equal(consumerClicks, 1);
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	const agenda = host.querySelector<HTMLElement>("section[aria-labelledby]");
	assert.ok(agenda);
	assert.match(agenda.textContent ?? "", /listener-order/u);
	const agendaTitleId = agenda.getAttribute("aria-labelledby");
	if (agendaTitleId === null || agendaTitleId.length === 0) {
		assert.fail("Expected the agenda to reference its title.");
	}
	assert.equal(dom.window.document.activeElement, dom.window.document.getElementById(agendaTitleId));
});

void test("a rejected renderEventOverflow Promise is observed, quarantined, and restores both variants", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	const rejection = new Error("private asynchronous overflow failure");
	let leakedRejection = false;
	const trackUnhandledRejection = (reason: unknown): void => {
		if (reason === rejection) {
			leakedRejection = true;
		}
	};
	process.on("unhandledRejection", trackUnhandledRejection);
	context.after(() => { process.off("unhandledRejection", trackUnhandledRejection); });
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-14", 2, "asynchronous-overflow"),
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 1,
		onError: (error) => { errors.push(error); },
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "asynchronous-overflow",
			renderEventOverflow: (renderContext) => {
				if (renderContext.variant === "compact") {
					const custom = renderContext.document.createElement("span");
					custom.className = "temporary-compact-overflow";
					return custom;
				}
				return Promise.reject(rejection) as never;
			}
		}]
	});

	calendar.render();
	await waitForPhase(calendar, "degraded");
	await Promise.resolve();
	await new Promise<void>((resolve) => { setImmediate(resolve); });

	assert.equal(leakedRejection, false);
	assert.ok(errors.some((error) =>
		error.hook === "renderEventOverflow" && error.surface === "grid-summary"));
	assert.equal(host.querySelector(".temporary-compact-overflow"), null);
	assertDefaultOverflowVariants(host, "2026-07-14");
	assert.doesNotMatch(host.textContent ?? "", /private asynchronous overflow failure/u);
});

function mutateWideOverflowPackage(
	context: Extract<CalendarEventOverflowContext, { readonly variant: "wide" }>,
	mutation: OverflowPackageMutation
): void {
	switch (mutation) {
		case "remove the root":
			context.elements.root.remove();
			return;
		case "change the action label":
			context.elements.action.setAttribute("aria-label", "Application-owned replacement");
			return;
		case "append interactive content": {
			const intruder = context.document.createElement("button");
			intruder.className = "overflow-package-intruder";
			context.elements.content.append(intruder);
			return;
		}
	}
}

function assertDefaultOverflowVariants(host: HTMLElement, dateString: string): void {
	const compact = getCompactOverflowRoot(host, dateString);
	const wide = getWideOverflowRoot(host, dateString);
	assert.equal(getOverflowContent(compact).textContent, "+1");
	assert.equal(getOverflowContent(wide).textContent, "1 more");
	for (const root of [compact, wide]) {
		assert.equal(root.getAttribute("aria-hidden"), "true");
		assert.equal(root.classList.contains("lfc-has-custom-event-overflow"), false);
	}
}

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(context: TestContext): TestDom {
	const dom = createDom('<div id="calendar"></div>');
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host, "Expected #calendar to exist.");
	return { dom, host };
}

function event(id: string, start: string, title: string): CalendarEventInput {
	return { id, start, title };
}

function eventsForDate(
	dateString: string,
	count: number,
	idPrefix: string
): readonly CalendarEventInput[] {
	return Array.from({ length: count }, (_, index) => event(
		`${idPrefix}-${index.toString()}`,
		`${dateString}T09:00`,
		`${idPrefix} ${index.toString()}`
	));
}

function getCompactOverflowRoot(host: HTMLElement, dateString: string): HTMLElement {
	const button = host.querySelector<HTMLButtonElement>(
		`.lfc-calendar-day-button[data-lfc-date='${dateString}']`
	);
	assert.ok(button, `Expected the ${dateString} day button to exist.`);
	const root = button.closest("[role='gridcell']")?.querySelector<HTMLElement>(
		".lfc-calendar-event-overflow.lfc-is-compact"
	);
	assert.ok(root, `Expected the ${dateString} compact overflow root to exist.`);
	return root;
}

function getGridOverflowButton(host: HTMLElement, dateString: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(
		`.lfc-calendar-grid-more[data-lfc-date='${dateString}']`
	);
	assert.ok(button, `Expected the ${dateString} grid-overflow button to exist.`);
	return button;
}

function getOverflowContent(root: HTMLElement): HTMLElement {
	const content = root.querySelector<HTMLElement>(
		":scope > .lfc-calendar-event-overflow-content"
	);
	assert.ok(content, "Expected the event-overflow content slot to exist.");
	return content;
}

function getWideOverflowRoot(host: HTMLElement, dateString: string): HTMLElement {
	const root = getGridOverflowButton(host, dateString).querySelector<HTMLElement>(
		":scope > .lfc-calendar-event-overflow.lfc-is-wide"
	);
	assert.ok(root, `Expected the ${dateString} wide overflow root to exist.`);
	return root;
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
