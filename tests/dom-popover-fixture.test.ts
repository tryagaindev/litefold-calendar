import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createDom, isPopoverOpen } from "./helpers/dom.js";

void test("popover fixtures render before toggle listeners focus their controls", (context) => {
	const { dom, outside, popover, select } = createPopoverFixture(context);
	const displays: string[] = [];
	outside.focus();
	select.focus();
	assert.equal(dom.window.document.activeElement, outside);
	popover.addEventListener("toggle", () => {
		displays.push(dom.window.getComputedStyle(popover).display);
		if (isPopoverOpen(popover)) {
			select.focus();
		}
	});

	popover.showPopover();
	assert.equal(isPopoverOpen(popover), true);
	assert.equal(dom.window.document.activeElement, select);

	outside.focus();
	popover.hidePopover();
	select.focus();
	assert.equal(isPopoverOpen(popover), false);
	assert.equal(dom.window.document.activeElement, outside);
	assert.deepEqual(displays, ["block", "none"]);
	assert.equal(popover.hasAttribute("style"), false);
});

void test("canceling a popover fixture opening preserves hidden focus and authored styles", (context) => {
	const { dom, outside, popover, select } = createPopoverFixture(context);
	popover.style.color = "red";
	const originalStyle = popover.getAttribute("style");
	let toggles = 0;
	popover.addEventListener("beforetoggle", (event) => { event.preventDefault(); }, { once: true });
	popover.addEventListener("toggle", () => { toggles += 1; });
	outside.focus();

	popover.showPopover();
	select.focus();

	assert.equal(isPopoverOpen(popover), false);
	assert.equal(dom.window.getComputedStyle(popover).display, "none");
	assert.equal(dom.window.document.activeElement, outside);
	assert.equal(popover.getAttribute("style"), originalStyle);
	assert.equal(toggles, 0);
});

void test("popover fixtures restore authored display priority while retaining independent style changes", (context) => {
	const { popover } = createPopoverFixture(context);
	popover.style.setProperty("display", "grid", "important");
	popover.style.color = "red";

	popover.showPopover();
	popover.showPopover();
	popover.style.color = "blue";
	popover.hidePopover();
	const restoredStyle = popover.getAttribute("style");
	popover.hidePopover();

	assert.equal(popover.style.getPropertyValue("display"), "grid");
	assert.equal(popover.style.getPropertyPriority("display"), "important");
	assert.equal(popover.style.color, "blue");
	assert.equal(popover.getAttribute("style"), restoredStyle);
	assert.equal(isPopoverOpen(popover), false);
});

void test("popover fixtures preserve an existing empty style attribute", (context) => {
	const { popover } = createPopoverFixture(context);
	popover.setAttribute("style", "");

	popover.showPopover();
	popover.hidePopover();

	assert.equal(popover.getAttribute("style"), "");
});

function createPopoverFixture(context: TestContext) {
	const dom = createDom([
		'<button id="outside" type="button">Outside</button>',
		'<div id="popover" popover="auto">',
		'<select aria-label="Month"><option>July</option></select>',
		"</div>"
	].join(""));
	context.after(() => { dom.window.close(); });
	const outside = dom.window.document.querySelector<HTMLButtonElement>("#outside");
	const popover = dom.window.document.querySelector<HTMLElement>("#popover");
	const select = dom.window.document.querySelector<HTMLSelectElement>("select");
	assert.ok(outside);
	assert.ok(popover);
	assert.ok(select);
	return { dom, outside, popover, select };
}
