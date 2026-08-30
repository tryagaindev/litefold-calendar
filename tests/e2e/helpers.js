import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

const READY_SELECTOR = 'html[data-test-ready="true"]';
const WCAG_TAGS = Object.freeze([
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa"
]);

export async function expectExampleReady(page, route) {
	const response = await page.goto(route, { waitUntil: "domcontentloaded" });
	expect(response?.ok(), `Expected ${route} to return a successful response.`).toBe(true);
	await expect(page.locator(READY_SELECTOR)).toHaveCount(1);
	await expect(page.locator("[data-my-calendar]")).not.toHaveAttribute("aria-busy", "true");
}

export async function expectNoAutomatedAccessibilityViolations(page, testInfo) {
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
	await testInfo.attach("axe-results", {
		body: Buffer.from(JSON.stringify(results, null, 2), "utf8"),
		contentType: "application/json"
	});

	const summary = results.violations.map((violation) => ({
		help: violation.help,
		id: violation.id,
		impact: violation.impact,
		nodes: violation.nodes.map((node) => node.target)
	}));
	expect(summary, "Expected the rendered example to have no automated WCAG violations.").toEqual([]);
}

export function gridEventActions(page, eventId) {
	const idSelector = eventId === undefined ? "" : `[data-test-event-id="${eventId}"]`;
	const fixtureSelector = `[data-test-event-surface="grid-summary"]${idSelector}`;
	return page.locator(
		`:is(a, button)${fixtureSelector}, ${fixtureSelector} :is(a, button)`
	);
}

export function focusedGridEventAction(page) {
	return page.locator(
		':is(a, button)[data-test-event-surface="grid-summary"]:focus, ' +
		'[data-test-event-surface="grid-summary"] :is(a, button):focus'
	);
}

export async function focusedEventId(page) {
	return page.evaluate(() => {
		if (!(document.activeElement instanceof HTMLElement)) {
			return null;
		}
		return document.activeElement.closest("[data-test-event-id]")
			?.getAttribute("data-test-event-id") ?? null;
	});
}

export async function expectOnlyOneGridTabStop(grid) {
	await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
}
