import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import { REPOSITORY_ROOT } from "../lib/process.mjs";
import { requireElement, waitFor } from "./helpers.mjs";

const EXPOSED_GLOBALS = [
	"AbortController",
	"AbortSignal",
	"CustomEvent",
	"DOMException",
	"Element",
	"Event",
	"HTMLAnchorElement",
	"HTMLButtonElement",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLTimeElement",
	"KeyboardEvent",
	"MouseEvent",
	"Node",
	"URL"
];

async function createExampleEnvironment(directoryName) {
	const directory = join(REPOSITORY_ROOT, "examples", directoryName);
	const markup = await readFile(join(directory, "index.html"), "utf8");
	const dom = new JSDOM(markup, {
		pretendToBeVisual: true,
		url: `https://example.test/examples/${directoryName}/`
	});
	const descriptors = new Map();
	const observedWarnings = [];
	const originalConsoleWarn = console.warn;
	let disposed = false;

	const installGlobal = (name, value) => {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
	};
	const restoreGlobals = () => {
		for (const [name, descriptor] of descriptors) {
			if (descriptor === undefined) {
				Reflect.deleteProperty(globalThis, name);
			} else {
				Object.defineProperty(globalThis, name, descriptor);
			}
		}
	};
	const dispose = () => {
		if (disposed) {
			return;
		}
		disposed = true;
		dom.window.dispatchEvent(new dom.window.Event("pagehide"));
		console.warn = originalConsoleWarn;
		restoreGlobals();
		dom.window.close();
	};

	try {
		installGlobal("window", dom.window);
		installGlobal("document", dom.window.document);
		for (const name of EXPOSED_GLOBALS) {
			if (name in dom.window) {
				installGlobal(name, dom.window[name]);
			}
		}
		console.warn = (...arguments_) => {
			observedWarnings.push(arguments_);
		};
		const module = await import(
			`${pathToFileURL(join(directory, "main.js")).href}?recipe-smoke=${Date.now().toString()}`
		);
		return { dispose, document: dom.window.document, dom, module, observedWarnings };
	} catch (error) {
		dispose();
		throw error;
	}
}

function findButtonByText(root, text, window) {
	const button = [...root.querySelectorAll("button")]
		.find((candidate) => candidate.textContent?.includes(text) === true);
	assert.ok(button instanceof window.HTMLButtonElement, `Expected a button containing ${text}.`);
	return button;
}

function findLinkByText(root, text, window) {
	const link = [...root.querySelectorAll("a")]
		.find((candidate) => candidate.textContent?.includes(text) === true);
	assert.ok(link instanceof window.HTMLAnchorElement, `Expected a link containing ${text}.`);
	return link;
}

async function verifyBasicExample() {
	const environment = await createExampleEnvironment("basic");
	const { document, dom } = environment;
	try {
		const host = requireElement(document, "[data-my-calendar]", dom.window.HTMLElement);
		const result = requireElement(document, "[data-my-result]", dom.window.HTMLElement);
		await waitFor(
			() => host.textContent?.includes("Calendar design review") === true &&
				host.getAttribute("aria-busy") !== "true",
			"the basic example's first usable snapshot"
		);

		const grid = requireElement(host, '[role="grid"]', dom.window.HTMLElement);
		const agenda = requireElement(host, "ol", dom.window.HTMLOListElement);
		const gridLink = findLinkByText(grid, "Documentation walkthrough", dom.window);
		const gridClick = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
		gridLink.dispatchEvent(gridClick);
		assert.equal(gridClick.defaultPrevented, true, "The basic fixture must prevent demo navigation.");
		assert.match(result.textContent ?? "", /grid-summary surface/u);

		findButtonByText(agenda, "Calendar design review", dom.window).click();
		assert.match(result.textContent ?? "", /agenda surface/u);

		const cachedPagehide = new dom.window.Event("pagehide");
		Object.defineProperty(cachedPagehide, "persisted", { value: true });
		dom.window.dispatchEvent(cachedPagehide);
		assert.ok(host.childElementCount > 0, "A back/forward-cache pagehide must preserve the calendar.");

		dom.window.dispatchEvent(new dom.window.Event("pagehide"));
		assert.equal(host.childElementCount, 0, "A non-cached pagehide must destroy the calendar.");
	} finally {
		environment.dispose();
	}
}

async function verifyAsyncErrorsExample() {
	const environment = await createExampleEnvironment("async-errors");
	const { document, dom, observedWarnings } = environment;
	try {
		const host = requireElement(document, "[data-my-calendar]", dom.window.HTMLElement);
		const applicationOwnership = requireElement(
			document,
			"[data-my-host-ownership]",
			dom.window.HTMLInputElement
		);
		const failAction = requireElement(document, "[data-my-fail-action]", dom.window.HTMLInputElement);
		const failRenderHooks = requireElement(document, "[data-my-fail-render-hooks]", dom.window.HTMLInputElement);
		const failNext = requireElement(document, "[data-my-fail-next]", dom.window.HTMLButtonElement);
		const applicationError = requireElement(document, "[data-my-host-error]", dom.window.HTMLElement);
		const applicationRetry = requireElement(document, "[data-my-host-retry]", dom.window.HTMLButtonElement);

		await waitFor(
			() => host.textContent?.includes("Render hooks active") === true &&
				host.getAttribute("aria-busy") !== "true",
			"the async-errors example's first usable snapshot",
			1_000
		);

		failNext.click();
		await waitFor(
			() => host.textContent?.includes("Calendar may be out of date") === true,
			"the package-owned retained-data warning",
			1_000
		);
		findButtonByText(host, "Retry", dom.window).click();
		await waitFor(
			() => host.textContent?.includes("Calendar may be out of date") !== true &&
				host.getAttribute("aria-busy") !== "true",
			"package-owned source recovery",
			1_000
		);

		applicationOwnership.click();
		assert.equal(applicationOwnership.checked, true);
		failNext.click();
		await waitFor(
			() => !applicationError.hidden,
			"the application-owned source error",
			1_000
		);
		assert.match(applicationError.textContent ?? "", /Calendar may be out of date/u);
		assert.equal(host.textContent?.includes("Calendar may be out of date"), false);
		applicationRetry.click();
		await waitFor(
			() => applicationError.hidden && host.getAttribute("aria-busy") !== "true",
			"application-owned source recovery",
			1_000
		);

		failAction.click();
		assert.equal(failAction.checked, true);
		const agenda = requireElement(host, "ol", dom.window.HTMLOListElement);
		findButtonByText(agenda, "Open async details", dom.window).click();
		await waitFor(
			() => host.textContent?.includes("Action failed") === true,
			"the rejected async event action"
		);

		failRenderHooks.click();
		assert.equal(failRenderHooks.checked, true);
		await waitFor(
			() => host.textContent?.includes("Some details are unavailable") === true &&
				host.textContent?.includes("Open async details") === true,
			"the quarantined failing render hooks",
			1_000
		);
		failRenderHooks.click();
		assert.equal(failRenderHooks.checked, false);
		await waitFor(
			() => host.textContent?.includes("Render hooks active") === true &&
				host.textContent?.includes("Some details are unavailable") !== true,
			"the rebuilt healthy render hooks",
			1_000
		);
		assert.ok(observedWarnings.length >= 3, "Expected source, action, and render-hook diagnostics.");

		dom.window.dispatchEvent(new dom.window.Event("pagehide"));
		assert.equal(host.childElementCount, 0, "The async-errors example must destroy on pagehide.");
	} finally {
		environment.dispose();
	}
}

function createMigrationRecord(overrides = {}) {
	return {
		backgroundColor: "#805FC0",
		end: "2026-08-04T12:23",
		extendedProps: { kind: "meeting", ownerLabel: "Design group" },
		id: "design-review",
		start: "2026-08-04T11:38",
		title: "Calendar design review",
		url: "/events/design-review?from=month&view=summary#agenda",
		...overrides
	};
}

async function verifyMigrationRecipe() {
	const environment = await createExampleEnvironment("fullcalendar-v6-migration");
	const { document, dom, module } = environment;
	try {
		const host = requireElement(document, "[data-my-calendar]", dom.window.HTMLElement);
		const selection = requireElement(document, "[data-my-selection]", dom.window.HTMLElement);
		const activation = requireElement(document, "[data-my-activation]", dom.window.HTMLElement);
		assert.equal(host.dataset["testRangeDays"], "42");

		await waitFor(
			() => document.documentElement.dataset["testReady"] === "true",
			"the migration recipe's first usable snapshot"
		);
		const grid = requireElement(host, '[role="grid"]', dom.window.HTMLElement);
		const agenda = requireElement(host, "ol", dom.window.HTMLOListElement);
		assert.ok(agenda.querySelector("li") !== null, "Expected native agenda list items.");
		assert.ok(agenda.querySelector("time[datetime]") instanceof dom.window.HTMLTimeElement);

		const gridLink = findLinkByText(grid, "Calendar design review", dom.window);
		const agendaLink = findLinkByText(agenda, "Calendar design review", dom.window);
		for (const link of [gridLink, agendaLink]) {
			assert.equal(link.pathname, "/events/design-review");
			assert.equal(link.search, "?from=month&view=summary");
			assert.equal(link.hash, "#agenda", "The migration recipe must preserve the fragment.");
		}

		const selectionBeforeGridAction = selection.textContent;
		const gridClick = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
		gridLink.dispatchEvent(gridClick);
		assert.equal(gridClick.defaultPrevented, true, "The fixture must synchronously prevent demo navigation.");
		assert.match(activation.textContent ?? "", /from grid-summary/u);
		assert.equal(
			selection.textContent,
			selectionBeforeGridAction,
			"Direct grid-event activation must not select its represented day."
		);

		const agendaClick = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
		agendaLink.dispatchEvent(agendaClick);
		assert.equal(agendaClick.defaultPrevented, true);
		assert.match(activation.textContent ?? "", /from agenda/u);
		assert.equal(
			requireElement(document, "[data-my-status]", dom.window.HTMLElement).textContent,
			activation.textContent,
			"Canceled native navigation must also produce live completion feedback."
		);

		const adaptSnapshot = module["adaptFullCalendarSnapshot"];
		assert.equal(typeof adaptSnapshot, "function", "Expected the exported migration adapter.");
		const adapted = adaptSnapshot([createMigrationRecord()]);
		assert.equal(adapted[0]?.id, "design-review");
		assert.equal(adapted[0]?.url, "/events/design-review?from=month&view=summary#agenda");
		assert.equal(adapted[0]?.metadata?.kind, "meeting");
		assert.equal(adapted[0]?.accentColor, "#805FC0");
		assert.equal(adaptSnapshot([createMigrationRecord({ id: 42 })])[0]?.id, "42");
		assert.equal(
			adaptSnapshot([createMigrationRecord({ allDay: false })])[0]?.start,
			"2026-08-04T11:38"
		);
		assert.equal(
			adaptSnapshot([createMigrationRecord({
				allDay: true,
				end: "2026-08-05",
				start: "2026-08-04"
			})])[0]?.start,
			"2026-08-04"
		);
		assert.equal(
			adaptSnapshot([createMigrationRecord({ backgroundColor: undefined, borderColor: "#008577" })])[0]
				?.accentColor,
			"#008577"
		);
		assert.throws(() => adaptSnapshot({ events: [] }), TypeError);
		assert.throws(() => adaptSnapshot([createMigrationRecord({ id: null })]), TypeError);
		assert.throws(() => adaptSnapshot([createMigrationRecord({ allDay: true })]), TypeError);
		assert.throws(() => adaptSnapshot([createMigrationRecord({ allDay: false, start: "2026-08-04" })]), TypeError);
		assert.throws(() => adaptSnapshot([createMigrationRecord({ end: "2026-08-05" })]), TypeError);

		const previousCivilDate = module["previousCivilDate"];
		assert.equal(typeof previousCivilDate, "function", "Expected the exported boundary adapter.");
		assert.equal(previousCivilDate("2026-03-01"), "2026-02-28");
		assert.equal(previousCivilDate("2024-03-01"), "2024-02-29");
		for (const invalidDate of ["2026-02-30", "2026-2-03", "2026-02-03T00:00", "0000-01-01"]) {
			assert.throws(() => previousCivilDate(invalidDate), TypeError);
		}
		assert.throws(() => previousCivilDate("0001-01-01"), RangeError);

		const previousReturnedRequest = host.dataset["testReturnedRequest"];
		const refetch = requireElement(
			document,
			"[data-my-refetch]",
			dom.window.HTMLButtonElement
		);
		refetch.click();
		await waitFor(
			() => host.dataset["testAbortedRequests"] === "1" &&
				host.dataset["testReturnedRequest"] !== previousReturnedRequest &&
				document.documentElement.dataset["testPhase"] === "ready",
			"the superseded migration request to abort and the latest snapshot to commit"
		);
	} finally {
		environment.dispose();
	}
}

async function verifyProgressiveRecipe() {
	const environment = await createExampleEnvironment("progressive-enhancement");
	const { document, dom } = environment;
	try {
		const host = requireElement(document, "[data-my-calendar]", dom.window.HTMLElement);
		const fallback = requireElement(document, "[data-my-fallback]", dom.window.HTMLElement);
		assert.equal(fallback.hidden, false, "The fallback must remain unchanged during first loading.");
		assert.ok(fallback.querySelector("ol > li time[datetime]") instanceof dom.window.HTMLTimeElement);
		assert.equal(
			findLinkByText(fallback, "Calendar design review", dom.window).getAttribute("href"),
			"./?event=design-review&from=fallback#my-server-schedule"
		);

		await waitFor(
			() => document.documentElement.dataset["testReady"] === "true",
			"the progressive recipe's first usable snapshot"
		);
		assert.equal(fallback.hidden, true, "The first usable snapshot must hide the fallback.");
		const agenda = requireElement(host, "ol", dom.window.HTMLOListElement);
		assert.ok(agenda.querySelector("li") !== null);
		assert.ok(agenda.querySelector("time[datetime]") instanceof dom.window.HTMLTimeElement);
		const agendaLink = findLinkByText(agenda, "Calendar design review", dom.window);
		assert.equal(agendaLink.pathname, "/examples/progressive-enhancement/");
		assert.equal(agendaLink.search, "?event=design-review&from=calendar");
		assert.equal(agendaLink.hash, "#my-server-schedule");
		const staticEvent = [...agenda.querySelectorAll("li")]
			.find((item) => item.textContent?.includes("Release window") === true);
		assert.ok(staticEvent !== undefined);
		assert.equal(staticEvent.querySelector("a, button"), null, "An event without an action must stay static.");

		const failure = requireElement(
			document,
			'[data-my-rebuild="failure"]',
			dom.window.HTMLButtonElement
		);
		failure.click();
		assert.equal(fallback.hidden, false, "Destroy/rebuild must restore fallback before loading.");
		await waitFor(
			() => document.documentElement.dataset["testPhase"] === "unavailable",
			"the progressive recipe's unavailable first load"
		);
		assert.equal(fallback.hidden, false, "An unavailable first load must preserve the fallback.");
		const assertiveAnnouncer = requireElement(
			document,
			"[data-my-announcer-assertive]",
			dom.window.HTMLElement
		);
		await waitFor(
			() => (assertiveAnnouncer.textContent?.length ?? 0) > 0,
			"the progressive recipe's assertive source-error announcement"
		);

		const success = requireElement(
			document,
			'[data-my-rebuild="success"]',
			dom.window.HTMLButtonElement
		);
		success.click();
		assert.equal(fallback.hidden, false, "Retry loading must leave the fallback visible.");
		await waitFor(
			() => document.documentElement.dataset["testReady"] === "true",
			"the progressive recipe's rebuilt usable snapshot"
		);
		assert.equal(fallback.hidden, true);

		dom.window.dispatchEvent(new dom.window.Event("pagehide"));
		assert.equal(fallback.hidden, false, "Destroy must restore the fallback's original state.");
		assert.equal(host.childElementCount, 0);
	} finally {
		environment.dispose();
	}
}

export async function verifyRecipeExamples() {
	await verifyBasicExample();
	await verifyAsyncErrorsExample();
	await verifyMigrationRecipe();
	await verifyProgressiveRecipe();
}
