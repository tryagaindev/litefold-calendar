import { expect, test } from "@playwright/test";

import { expectExampleReady, expectOnlyOneGridTabStop } from "./helpers.js";

const ANNOUNCEMENT_FIXTURE_SELECTOR = "#my-screen-reader-announcement-fixture";
const FAILURE_FIXTURE_SELECTOR = "#my-screen-reader-failure-fixture";

async function mountAnnouncementFixture(page) {
	await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const fixture = document.createElement("section");
		fixture.id = "my-screen-reader-announcement-fixture";
		const heading = document.createElement("h2");
		heading.id = "my-screen-reader-announcement-title";
		heading.textContent = "Screen reader announcement fixture";
		const host = document.createElement("div");
		host.setAttribute("aria-labelledby", heading.id);
		fixture.append(heading, host);
		document.body.append(fixture);

		const calendar = createCalendar(host, {
			agendaPageSize: 10,
			events: Array.from({ length: 30 }, (_value, index) => ({
				id: `screen-reader-event-${String(index + 1)}`,
				start: "2026-08-06",
				title: `Screen reader event ${String(index + 1)}`
			})),
			initialDate: "2026-08-06",
			onEventActivate: () => undefined
		});
		calendar.render();
		Object.defineProperty(window, "__lfcScreenReaderAnnouncementFixture", {
			configurable: true,
			value: { calendar, host }
		});
	});
	await expect.poll(() => page.evaluate(() =>
		window.__lfcScreenReaderAnnouncementFixture.calendar.getState().phase
	)).toBe("ready");
	return page.locator(ANNOUNCEMENT_FIXTURE_SELECTOR).locator(":scope > div");
}

async function mountFailureFixture(page) {
	await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const fixture = document.createElement("section");
		fixture.id = "my-screen-reader-failure-fixture";
		const heading = document.createElement("h2");
		heading.id = "my-screen-reader-failure-title";
		heading.textContent = "Screen reader failure fixture";
		const host = document.createElement("div");
		host.setAttribute("aria-labelledby", heading.id);
		fixture.append(heading, host);
		document.body.append(fixture);

		const calendar = createCalendar(host, {
			events: async () => {
				throw new Error("Screen reader fixture source failure.");
			},
			initialDate: "2026-08-06",
			onError: () => "default"
		});
		calendar.render();
		Object.defineProperty(window, "__lfcScreenReaderFailureFixture", {
			configurable: true,
			value: { calendar, host }
		});
	});
	await expect.poll(() => page.evaluate(() =>
		window.__lfcScreenReaderFailureFixture.calendar.getState().phase
	)).toBe("unavailable");
	return page.locator(FAILURE_FIXTURE_SELECTOR).locator(":scope > div");
}

test.describe("screen-reader-facing browser semantics", () => {
	test("exposes navigation, selection, and agenda structure in the computed accessibility tree", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");

		const navigation = page.getByRole("group", { name: "Schedule navigation" });
		await expect(navigation).toMatchAriaSnapshot(`
			- group "Schedule navigation":
			  - button "Earlier month"
			  - button "Later month"
			  - heading "Choose schedule month and year, currently August 2026" [level=3]:
			    - button "Choose schedule month and year, currently August 2026": August 2026
			  - button "Today"
		`);

		const grid = page.getByRole("grid", { name: "August 2026" });
		await expect(grid).toHaveAttribute("aria-readonly", "true");
		await expectOnlyOneGridTabStop(grid);
		const selectedDay = grid.getByRole("gridcell", { selected: true });
		await expect(selectedDay).toMatchAriaSnapshot(`
			- gridcell [selected]:
			  - button "Thursday, August 6, 2026, 53 items"
			  - button "View 51 more items for Thursday, August 6, 2026"
		`);
		await expect(selectedDay.locator(":scope > .lfc-calendar-day-button"))
			.toHaveAttribute("aria-current", "date");

		const agenda = page.getByRole("region", {
			exact: true,
			name: "Schedule for Thursday, August 6, 2026"
		});
		await expect(agenda).toMatchAriaSnapshot(`
			- region "Schedule for Thursday, August 6, 2026":
			  - heading "Schedule for Thursday, August 6, 2026" [level=4]
			  - list:
			    - listitem:
			      - 'button "Any time, milestone: Release window, In progress. View details."'
			  - button "Load 10 more"
			  - paragraph: Showing 10 of 53 items
		`);

		const calendar = page.locator("[data-my-calendar]");
		const politeLive = calendar.locator(".lfc-calendar-live-polite");
		const assertiveLive = calendar.locator(".lfc-calendar-live-assertive");
		await expect(politeLive).toHaveAttribute("aria-atomic", "true");
		await expect(politeLive).toHaveAttribute("aria-live", "polite");
		await expect(politeLive).toMatchAriaSnapshot("- status");
		await expect(assertiveLive).toHaveAttribute("aria-atomic", "true");
		await expect(assertiveLive).toHaveAttribute("aria-live", "assertive");
		await expect(assertiveLive).toMatchAriaSnapshot("- alert");
	});

	test("keyboard navigation keeps current date, focus, and selection as distinct accessible states", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid", { name: "August 2026" });
		const currentDay = grid.locator('.lfc-calendar-day-button[data-lfc-date="2026-08-06"]');
		const nextDay = grid.locator('.lfc-calendar-day-button[data-lfc-date="2026-08-07"]');

		await currentDay.focus();
		await currentDay.press("ArrowRight");
		await expect(nextDay).toBeFocused();
		await expect(nextDay).toHaveAccessibleName("Friday, August 7, 2026, 2 items");
		await expect(currentDay).toHaveAttribute("aria-current", "date");
		await expect(nextDay).not.toHaveAttribute("aria-current", "date");
		await expect(grid.getByRole("gridcell", { selected: true })).toMatchAriaSnapshot(`
			- gridcell [selected]:
			  - button "Thursday, August 6, 2026, 53 items"
		`);
		await expectOnlyOneGridTabStop(grid);

		await nextDay.press("Enter");
		await expect(nextDay).toBeFocused();
		await expect(grid.getByRole("gridcell", { selected: true })).toMatchAriaSnapshot(`
			- gridcell [selected]:
			  - button "Friday, August 7, 2026, 2 items"
		`);
		await expect(page.getByRole("region", {
			exact: true,
			name: "Schedule for Friday, August 7, 2026"
		})).toMatchAriaSnapshot(`
			- region "Schedule for Friday, August 7, 2026":
			  - heading "Schedule for Friday, August 7, 2026" [level=4]
			  - list:
			    - listitem:
			      - 'button "Any time, milestone: Release window, In progress. View details."'
			    - listitem:
			      - 'button "10:30 AM, appointment: Follow-up call, Confirmed. View details."'
		`);
		await expectOnlyOneGridTabStop(grid);
	});

	test("routes progress and failures through polite and assertive live regions without stealing focus", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const announcementHost = await mountAnnouncementFixture(page);
		const politeLive = announcementHost.getByRole("status");
		const assertiveLive = announcementHost.getByRole("alert");
		await expect(politeLive).toHaveAttribute("aria-atomic", "true");
		await expect(politeLive).toHaveAttribute("aria-live", "polite");
		await expect(assertiveLive).toHaveAttribute("aria-atomic", "true");
		await expect(assertiveLive).toHaveAttribute("aria-live", "assertive");
		await expect(politeLive).toMatchAriaSnapshot("- status");
		await expect(assertiveLive).toMatchAriaSnapshot("- alert");

		const agenda = announcementHost.getByRole("region", {
			exact: true,
			name: "Events for Thursday, August 6, 2026"
		});
		await agenda.getByRole("button", { name: "Show 10 more" }).click();
		await expect(politeLive).toHaveText("Showing 20 of 30 events");
		await expect(politeLive).toMatchAriaSnapshot("- status: Showing 20 of 30 events");
		await expect(assertiveLive).toBeEmpty();
		await expect(agenda.getByRole("listitem")).toHaveCount(20);
		const firstRevealedAction = agenda.getByRole("listitem").nth(10).getByRole("button");
		await expect(firstRevealedAction).toBeFocused();

		const failureHost = await mountFailureFixture(page);
		const failurePoliteLive = failureHost.getByRole("status");
		const failureAssertiveLive = failureHost.getByRole("alert");
		await expect(failurePoliteLive).toBeEmpty();
		await expect(failureAssertiveLive).toHaveText(
			"Calendar unavailable. Events could not be loaded. Try again."
		);
		await expect(failureAssertiveLive).toMatchAriaSnapshot(
			"- alert: Calendar unavailable. Events could not be loaded. Try again."
		);
		await expect(firstRevealedAction).toBeFocused();
	});
});
