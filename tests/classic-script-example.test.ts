import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Module, Script, type ScriptOptions } from "node:vm";

import { JSDOM } from "jsdom";

import * as publicApi from "../src/index.js";
import { waitFor } from "./helpers/dom.js";

interface ClassicEntry {
	readonly dom: JSDOM;
	readonly path: string;
	readonly source: string;
}

void test("the classic-script example starts and tears down through a regular script", async (context) => {
	const entry = await loadClassicEntry();
	context.after(() => { entry.dom.window.close(); });

	executeEntry(entry, async () => publicApi as unknown as Module);
	const host = requireElement(entry.dom, "[data-calendar]");
	await waitFor(
		() => host.hasAttribute("data-litefold-calendar") && host.getAttribute("aria-busy") !== "true",
		"classic-script calendar startup"
	);

	assert.match(host.textContent ?? "", /Alpha release window/u);
	const eventLink = [...host.querySelectorAll<HTMLAnchorElement>("section[aria-labelledby] a")]
		.find((link) => link.textContent?.includes("Calendar design review"));
	assert.ok(eventLink, "Expected the rendered native event link.");
	assert.equal(
		eventLink.getAttribute("href"),
		"/events/design-review?from=classic-script#details"
	);
	eventLink.click();
	const result = requireElement(entry.dom, "[data-result]");
	await waitFor(
		() => result.textContent?.includes("Calendar design review") === true,
		"classic-script event activation"
	);

	entry.dom.window.dispatchEvent(new entry.dom.window.Event("pagehide"));
	assert.equal(host.childElementCount, 0);
	assert.equal(host.hasAttribute("data-litefold-calendar"), false);
});

void test("the classic-script example reports module-loading startup failures accessibly", async (context) => {
	const entry = await loadClassicEntry();
	context.after(() => { entry.dom.window.close(); });
	const failure = new Error("simulated module load failure");
	let reported: unknown;
	Object.defineProperty(entry.dom.window, "reportError", {
		configurable: true,
		value: (error: unknown) => { reported = error; }
	});

	executeEntry(entry, async () => { throw failure; });
	const alert = requireElement(entry.dom, "[data-startup-error]");
	await waitFor(() => (alert.textContent?.trim().length ?? 0) > 0, "classic-script startup error");

	assert.equal(reported, failure);
	assert.equal(requireElement(entry.dom, "[data-calendar]").childElementCount, 0);
});

async function loadClassicEntry(): Promise<ClassicEntry> {
	const exampleDirectory = resolve(process.cwd(), "examples", "classic-script");
	const documentPath = resolve(exampleDirectory, "index.html");
	const markup = await readFile(documentPath, "utf8");
	const dom = new JSDOM(markup, {
		pretendToBeVisual: true,
		runScripts: "outside-only",
		url: pathToFileURL(documentPath).href
	});
	const scripts = [...dom.window.document.scripts];
	assert.equal(scripts.length, 1, "Expected one classic entry script.");
	const entryScript = scripts[0];
	assert.ok(entryScript);
	assert.equal(entryScript.type, "", "The entry must use classic-script semantics.");
	assert.equal(entryScript.defer, true, "The classic entry must not block document parsing.");

	const entryUrl = new URL(entryScript.src);
	assert.equal(entryUrl.protocol, "file:", "The example entry must remain repository-local.");
	const entryPath = fileURLToPath(entryUrl);
	assert.equal(dirname(entryPath), exampleDirectory, "The entry must remain inside its example directory.");
	return {
		dom,
		path: entryPath,
		source: await readFile(entryPath, "utf8")
	};
}

function executeEntry(
	entry: ClassicEntry,
	load: NonNullable<ScriptOptions["importModuleDynamically"]>
): void {
	const script = new Script(entry.source, {
		filename: entry.path,
		importModuleDynamically: load
	});
	script.runInContext(entry.dom.getInternalVMContext());
}

function requireElement(dom: JSDOM, selector: string): HTMLElement {
	const element = dom.window.document.querySelector(selector);
	assert.ok(element instanceof dom.window.HTMLElement, `Expected ${selector}.`);
	return element;
}
