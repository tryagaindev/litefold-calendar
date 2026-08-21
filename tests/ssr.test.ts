import assert from "node:assert/strict";
import test from "node:test";

import * as publicApi from "../src/index.js";

void test("the package can be imported without browser globals", () => {
	assert.equal(typeof globalThis.document, "undefined");
	assert.equal(typeof publicApi.createCalendar, "function");
	assert.equal(typeof publicApi.LitefoldCalendarError, "function");
	assert.deepEqual(Object.keys(publicApi).sort(), ["LitefoldCalendarError", "createCalendar"]);
});
