import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

const READY_SELECTOR = 'html[data-test-ready="true"]';
const LIBRARY_FIXTURE_ROUTE = "/examples/basic/?library-fixture=true";
const LIBRARY_FIXTURE_DOCUMENT = `<!doctype html>
<html lang="en" data-test-ready="true">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Calendar browser fixture</title>
<link rel="stylesheet" href="/dist/styles.css">
</head>
<body><main><div data-my-calendar></div></main></body>
</html>`;
const WCAG_TAGS = Object.freeze([
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa"
]);

export async function expectLibraryFixtureReady(page, { calendar = false } = {}) {
	//Keep the repository server's CSP and security headers; replace only the example document.
	await page.route((url) => url.searchParams.get("library-fixture") === "true", async (route) => {
		const response = await route.fetch();
		await route.fulfill({ body: LIBRARY_FIXTURE_DOCUMENT, response });
	}, { times: 1 });
	const response = await page.goto(LIBRARY_FIXTURE_ROUTE, { waitUntil: "load" });
	expect(response?.ok(), "Expected the isolated library document to load.").toBe(true);
	await expect(page.locator(READY_SELECTOR)).toHaveCount(1);
	if (calendar) {
		await page.evaluate(async () => {
			const { createCalendar } = await import("/dist/index.js");
			const host = document.querySelector("[data-my-calendar]");
			const instance = createCalendar(host, {
				events: [],
				initialDate: "2026-08-06",
				now: () => new Date("2026-08-07T02:00:00.000Z"),
				onDaySelect: () => {}
			});
			instance.render();
		});
		await expect(page.getByRole("grid")).toBeVisible();
	}
}

export async function expectExampleReady(page, route) {
	const response = await page.goto(route, { waitUntil: "commit" });
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
