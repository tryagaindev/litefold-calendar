import { expect, test } from "@playwright/test";

import { expectNoAutomatedAccessibilityViolations } from "./helpers.js";

const EXAMPLE = "/examples/remote-data/";
const FEED = "**/examples/remote-data/events.json?*";

async function openExample(page) {
	await page.goto(EXAMPLE, { waitUntil: "commit" });
	await expect(page.getByRole("grid").getByRole("button", { name: /^View 3 events for /u })).toBeVisible();
}

test("remote example fetches the fixture, filters, refreshes, and distinguishes empty results", async ({ page }) => {
	const [initialRequest] = await Promise.all([page.waitForRequest(FEED), openExample(page)]);
	const url = new URL(initialRequest.url());
	expect(url.searchParams.get("start")).toMatch(/^2026-07-[0-9]{2}$/u);
	expect(url.searchParams.get("end")).toMatch(/^2026-09-[0-9]{2}$/u);
	expect(url.searchParams.get("category")).toBe("all");
	await page.getByLabel("Category").selectOption("workshop");
	await expect(page.getByRole("grid").getByRole("button", { name: /Print workshop/u })).toBeVisible();
	await expect(page.getByRole("grid").getByRole("button", { name: /^View 3 events for /u })).toHaveCount(0);
	await page.getByLabel("Category").selectOption("sports");
	await expect(page.getByText("No events", { exact: true })).toBeVisible();
	const [refresh] = await Promise.all([
		page.waitForRequest(FEED),
		page.getByRole("button", { name: "Refresh events", exact: true }).click()
	]);
	expect(new URL(refresh.url()).searchParams.get("category")).toBe("sports");
	await expect(page.getByText("No events", { exact: true })).toBeVisible();
});

test("remote example opens a complete day chooser and restores focus", async ({ page }, testInfo) => {
	await openExample(page);
	const count = page.getByRole("grid").getByRole("button", { name: /^View 3 events for /u });
	await count.click();
	const dialog = page.getByRole("dialog", { name: "Events for 2026-08-06" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("button", { name: /^Choose /u })).toHaveCount(3);
	await expectNoAutomatedAccessibilityViolations(page, testInfo);
	await dialog.getByRole("button", { name: "Choose Print workshop", exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByRole("status").filter({ hasText: "Selected Print workshop" })).toContainText("No server data was changed.");
	await expect(count).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(dialog).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(count).toBeFocused();
});

test("remote example exposes Retry after failed response and recovers", async ({ page }) => {
	await openExample(page);
	await page.route(FEED, (route) => route.fulfill({ status: 503, body: "Unavailable" }), { times: 1 });
	await page.getByRole("button", { name: "Refresh events", exact: true }).click();
	await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
	await expect(page.getByRole("grid").getByRole("button", { name: /^View 3 events for /u })).toBeVisible();
});

test("remote dialog returns to its date when a refresh replaces the invoker", async ({ page }) => {
	await openExample(page);
	const count = page.getByRole("grid").getByRole("button", { name: /^View 3 events for /u });
	const invoker = await count.elementHandle();
	await count.click();
	await page.evaluate(() => document.querySelector("[data-my-refresh]").click());
	await expect.poll(() => invoker.evaluate((element) => element.isConnected)).toBe(false);
	await expect(page.locator("[data-my-calendar]")).not.toHaveAttribute("aria-busy", "true");
	await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
	await expect(page.getByRole("grid").getByRole("button", { name: /^Thursday, August 6, 2026, 3 events$/u })).toBeFocused();
});

test("remote example cancels superseded filters and tears down pending work", async ({ page }) => {
	await openExample(page);
	let finishOldRequest;
	const oldResponse = new Promise((resolve) => { finishOldRequest = resolve; });
	await page.route(FEED, async (route) => {
		if (new URL(route.request().url()).searchParams.get("category") === "community") {
			await oldResponse;
			//The browser may have cancelled the transport before this reply is sent.
			await route.fulfill({ json: [{ id: "stale", title: "Stale event", start: "2026-08-06", category: "community" }] });
		} else {
			await route.continue();
		}
	});
	const [supersededRequest] = await Promise.all([
		page.waitForRequest((request) => new URL(request.url()).searchParams.get("category") === "community"),
		page.getByLabel("Category").selectOption("community")
	]);
	await Promise.all([
		page.waitForEvent("requestfailed", (request) => request === supersededRequest),
		page.getByLabel("Category").selectOption("workshop")
	]);
	await expect(page.getByRole("grid").getByRole("button", { name: /Print workshop/u })).toBeVisible();
	finishOldRequest();
	await expect(page.getByText("Stale event", { exact: true })).toHaveCount(0);
	let finishRefresh;
	const refreshResponse = new Promise((resolve) => { finishRefresh = resolve; });
	await page.route(FEED, async (route) => {
		await refreshResponse;
		await route.abort();
	}, { times: 1 });
	const [pendingRequest] = await Promise.all([
		page.waitForRequest(FEED),
		page.getByRole("button", { name: "Refresh events", exact: true }).click()
	]);
	await Promise.all([
		page.waitForEvent("requestfailed", (request) => request === pendingRequest),
		page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })))
	]);
	finishRefresh();
	await expect(page.locator("[data-my-calendar]")).toBeEmpty();
	await page.getByLabel("Category").selectOption("all");
	await expect(page.locator("[data-my-calendar]")).toBeEmpty();
});
