import { expect, test } from "@playwright/test";

import { useBaselineFallbacks } from "./baseline-fallbacks.js";
import { expectLibraryFixtureReady } from "./helpers.js";

test.beforeEach(async ({ page }) => {
	await useBaselineFallbacks(page);
	await expectLibraryFixtureReady(page);
	await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const calendar = createCalendar(document.querySelector("[data-my-calendar]"), {
			events: [],
			initialDate: "2026-08-31",
			maxDate: "2027-02-28",
			minDate: "2026-02-01"
		});
		calendar.render();
		window.__lfcBaseline = calendar;
	});
});

test("dialog fallback validates navigation and restores focus after every dismissal", async ({ page }) => {
	const host = page.locator("[data-my-calendar]");
	const title = host.locator(".lfc-calendar-title-button");
	const picker = host.getByRole("dialog", { includeHidden: true });
	await expect(picker).toBeHidden();
	await title.click();
	await expect(picker).toBeVisible();
	await expect(title).toHaveAttribute("aria-expanded", "true");
	const month = picker.getByRole("combobox", { name: "Month", exact: true });
	const year = picker.getByLabel("Year", { exact: true });
	await expect(month).toBeFocused();
	await title.evaluate((element) => { element.focus(); });
	await expect(title).not.toBeFocused();
	await year.fill("2028");
	await picker.locator("button[type=submit]").click();
	await expect(picker).toBeVisible();
	await year.fill("2026");
	await month.selectOption("9");
	await picker.locator("button[type=submit]").click();
	await expect(picker).toBeHidden();
	await expect(title).toBeFocused();
	await expect(title).toContainText("September");
	await expect(host.locator('[role="gridcell"][aria-selected="true"] > button'))
		.toHaveAttribute("data-lfc-date", "2026-09-30");
	for (const dismissal of ["Escape", "Cancel", "backdrop"]) {
		await title.click();
		await month.selectOption("11");
		if (dismissal === "Escape") {
			await page.keyboard.press("Escape");
		} else if (dismissal === "Cancel") {
			await picker.getByRole("button", { name: "Cancel", exact: true }).click();
		} else {
			await page.mouse.click(1, 1);
		}
		await expect(picker).toBeHidden();
		await expect(title).toHaveAttribute("aria-expanded", "false");
		await expect(title).toBeFocused();
		await expect(title).toContainText("September");
	}
});

test("destroy closes the fallback modal and releases the document for reused host content", async ({ page }) => {
	const host = page.locator("[data-my-calendar]");
	await host.locator(".lfc-calendar-title-button").click();
	await expect(host.getByRole("dialog")).toBeVisible();
	await page.evaluate(() => window.__lfcBaseline.destroy());
	await expect(page.locator("dialog[open]")).toHaveCount(0);
	await host.evaluate((element) => {
		const button = document.createElement("button");
		button.textContent = "Reused host";
		element.replaceChildren(button);
	});
	const replacement = host.getByRole("button", { name: "Reused host" });
	await replacement.focus();
	await expect(replacement).toBeFocused();
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(replacement).toBeFocused();
	await expect(host).not.toHaveClass(/lfc-palette/u);
});
