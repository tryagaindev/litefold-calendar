import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import { isHTMLElementLike } from "../src/internal/runtime/safety.js";
import { createDom, installDom } from "./helpers/dom.js";

void test("HTMLElement branding accepts genuine elements across supported document contexts", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);

	const localElement = dom.window.document.createElement("div");
	dom.window.document.body.append(localElement);
	assert.equal(localElement.isConnected, true);
	const detachedElement = dom.window.document.createElement("section");
	assert.equal(detachedElement.isConnected, false);
	const foreignDom = new JSDOM("<main></main>");
	context.after(() => { foreignDom.window.close(); });
	const foreignElement = foreignDom.window.document.querySelector("main");
	assert.ok(foreignElement);
	assert.equal(foreignElement instanceof dom.window.HTMLElement, false);

	const contextlessDocument = dom.window.document.implementation.createHTMLDocument("Contextless");
	assert.equal(contextlessDocument.defaultView, null);
	const contextlessElement = contextlessDocument.createElement("article");
	const xhtmlDocument = new dom.window.DOMParser().parseFromString(
		'<aside xmlns="http://www.w3.org/1999/xhtml"></aside>',
		"application/xhtml+xml"
	);
	const xhtmlElement = xhtmlDocument.documentElement;
	assert.equal(xhtmlDocument.defaultView, null);

	for (const value of [
		localElement,
		detachedElement,
		foreignElement,
		contextlessElement,
		xhtmlElement
	]) {
		assert.equal(isHTMLElementLike(value), true);
	}
});

void test("HTMLElement branding rejects other nodes and counterfeit values", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const document = dom.window.document;
	const parser = new dom.window.DOMParser();
	const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	const mathElement = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
	const xmlElement = parser.parseFromString("<element></element>", "application/xml").documentElement;
	const fragment = document.createDocumentFragment();
	const structuralFake = {
		namespaceURI: "http://www.w3.org/1999/xhtml",
		nodeType: 1,
		ownerDocument: document,
		tagName: "DIV"
	};
	const prototypeFake = Object.create(dom.window.HTMLElement.prototype) as unknown;

	for (const value of [
		svgElement,
		mathElement,
		xmlElement,
		fragment,
		structuralFake,
		prototypeFake,
		undefined,
		null,
		"div",
		() => undefined
	]) {
		assert.equal(isHTMLElementLike(value), false);
	}
});

void test("HTMLElement branding contains proxy and ambient lookup failures", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const element = dom.window.document.createElement("div");
	const proxyFailure = new Error("proxy inspection failed");
	const throwingProxy = new Proxy(element, {
		get: () => { throw proxyFailure; }
	});
	const revocable = Proxy.revocable(element, {});
	revocable.revoke();

	assert.doesNotThrow(() => { assert.equal(isHTMLElementLike(throwingProxy), false); });
	assert.doesNotThrow(() => { assert.equal(isHTMLElementLike(revocable.proxy), false); });

	const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
	assert.ok(originalHTMLElement);
	try {
		Reflect.deleteProperty(globalThis, "HTMLElement");
		assert.equal(isHTMLElementLike(element), false);

		const missingGetter = function HTMLElement(): void { return undefined; };
		Object.defineProperty(globalThis, "HTMLElement", {
			configurable: true,
			value: missingGetter
		});
		assert.equal(isHTMLElementLike(element), false);

		const nonStringGetter = function HTMLElement(): void { return undefined; };
		Object.defineProperty(nonStringGetter.prototype, "title", {
			configurable: true,
			get: () => 42
		});
		Object.defineProperty(globalThis, "HTMLElement", {
			configurable: true,
			value: nonStringGetter
		});
		assert.equal(isHTMLElementLike(element), false);

		const throwingGetter = function HTMLElement(): void { return undefined; };
		Object.defineProperty(throwingGetter.prototype, "title", {
			configurable: true,
			get: () => { throw new Error("title getter failed"); }
		});
		Object.defineProperty(globalThis, "HTMLElement", {
			configurable: true,
			value: throwingGetter
		});
		assert.doesNotThrow(() => { assert.equal(isHTMLElementLike(element), false); });
	} finally {
		Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
	}
	assert.equal(isHTMLElementLike(element), true, "The ambient getter must be resolved at call time.");
});
