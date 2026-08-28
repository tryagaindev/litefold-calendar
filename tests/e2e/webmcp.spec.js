import { expect, test } from "@playwright/test";

import { expectExampleReady } from "./helpers.js";

const GET_EVENTS_TOOL_NAME = "litefold-advanced-get-events";
const NAVIGATE_TOOL_NAME = "litefold-advanced-navigate";

test("advanced example registers and invokes WebMCP tools with a browser mock", async ({ page }) => {
	await page.addInitScript(() => {
		const tools = new Map();
		const registrationOptions = new Map();
		const modelContext = Object.freeze({
			async registerTool(tool, options = {}) {
				if (tools.has(tool.name)) {
					throw new DOMException(`Duplicate mock WebMCP tool: ${tool.name}`, "InvalidStateError");
				}

				tools.set(tool.name, tool);
				registrationOptions.set(tool.name, options);
				options.signal?.addEventListener("abort", () => {
					tools.delete(tool.name);
					registrationOptions.delete(tool.name);
				}, { once: true });
			}
		});

		Object.defineProperty(window, "__litefoldWebMcpMock", {
			configurable: true,
			value: Object.freeze({ registrationOptions, tools })
		});
		Object.defineProperty(Document.prototype, "modelContext", {
			configurable: true,
			get: () => modelContext
		});
	});

	await expectExampleReady(page, "/examples/advanced/");

	await expect.poll(() => page.evaluate(() => (
		[...window.__litefoldWebMcpMock.tools.keys()].sort()
	))).toEqual([GET_EVENTS_TOOL_NAME, NAVIGATE_TOOL_NAME]);

	const invocation = await page.evaluate(async ({ getEventsToolName, navigateToolName }) => {
		const mock = window.__litefoldWebMcpMock;
		const getEventsTool = mock.tools.get(getEventsToolName);
		const navigateTool = mock.tools.get(navigateToolName);
		if (getEventsTool === undefined || navigateTool === undefined) {
			throw new Error("Expected the advanced example WebMCP tools to be registered.");
		}

		const executionContext = { signal: new AbortController().signal };
		const navigateResult = await navigateTool.execute({
			date: "2026-08-07",
			target: "date"
		}, executionContext);
		const rangeResult = await getEventsTool.execute({}, executionContext);
		const dateResult = await getEventsTool.execute({ date: "2026-08-07" }, executionContext);
		return {
			dateResult,
			getEventsHasSignal: mock.registrationOptions.get(getEventsToolName)?.signal instanceof AbortSignal,
			navigateHasSignal: mock.registrationOptions.get(navigateToolName)?.signal instanceof AbortSignal,
			navigateResult,
			rangeResult
		};
	}, {
		getEventsToolName: GET_EVENTS_TOOL_NAME,
		navigateToolName: NAVIGATE_TOOL_NAME
	});

	expect(invocation.getEventsHasSignal).toBe(true);
	expect(invocation.navigateHasSignal).toBe(true);
	expect(invocation.navigateResult).toMatchObject({ ok: true });
	await expect(page.locator("[data-example-state-selected]")).toHaveText("2026-08-07");
	expect(invocation.rangeResult).toMatchObject({
		date: null,
		dataAvailable: true,
		nextOffset: 10,
		offset: 0,
		ok: true,
		totalEvents: 54
	});
	expect(invocation.rangeResult.events).toHaveLength(10);
	expect(invocation.rangeResult.events.filter(({ title }) => title === "Release window")).toHaveLength(1);
	expect(JSON.stringify(invocation.rangeResult)).not.toContain("Post-window archive");
	expect(invocation.dateResult).toMatchObject({
		date: "2026-08-07",
		dataAvailable: true,
		events: [
			{
				end: "2026-08-08",
				isAllDay: true,
				start: "2026-08-05",
				title: "Release window"
			},
			{
				end: "2026-08-07T11:00",
				isAllDay: false,
				start: "2026-08-07T10:30",
				title: "Follow-up call"
			}
		],
		offset: 0,
		ok: true,
		totalEvents: 2
	});
});
