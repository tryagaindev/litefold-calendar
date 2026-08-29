import { expect, test } from "@playwright/test";

test("a forwarding DOM proxy cannot cross the public host boundary", async ({ page }) => {
	const response = await page.goto("/examples/basic/", { waitUntil: "domcontentloaded" });
	expect(response?.ok()).toBe(true);

	const result = await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const element = document.createElement("div");
		const proxy = new Proxy(element, {
			get: (target, key) => Reflect.get(target, key, target)
		});
		try {
			createCalendar(proxy, { events: [] });
			return {
				accepted: true,
				code: null,
				hostChildCount: element.childElementCount,
				hostCommitted: element.hasAttribute("data-litefold-calendar"),
				message: null
			};
		} catch (error) {
			return {
				accepted: false,
				code: error !== null && typeof error === "object" && "code" in error
					? String(error.code)
					: null,
				hostChildCount: element.childElementCount,
				hostCommitted: element.hasAttribute("data-litefold-calendar"),
				message: error instanceof Error ? error.message : null
			};
		}
	});

	expect(result).toEqual({
		accepted: false,
		code: "invalid-configuration",
		hostChildCount: 0,
		hostCommitted: false,
		message: "A valid HTMLElement host is required."
	});
});
