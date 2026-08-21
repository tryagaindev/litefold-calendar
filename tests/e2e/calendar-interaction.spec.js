import { expect, test } from "@playwright/test";

import {
	expectExampleReady,
	expectOnlyOneGridTabStop,
	focusedEventId,
	focusedGridEventAction,
	gridEventActions
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
	await expectExampleReady(page, "/examples/advanced/");
});

test("managed grid focus enters event actions with F2 and returns with Escape", async ({ page }) => {
	const grid = page.getByRole("grid");
	const selectedDay = grid.locator('[role="gridcell"][aria-selected="true"] > button');
	await selectedDay.focus();
	await expect(selectedDay).toBeFocused();
	await expectOnlyOneGridTabStop(grid);
	await expect(gridEventActions(page).first()).toHaveAttribute("tabindex", "-1");

	await selectedDay.press("F2");
	const firstAction = focusedGridEventAction(page);
	await expect(firstAction).toHaveCount(1);
	await expectOnlyOneGridTabStop(grid);
	const firstId = await focusedEventId(page);
	expect(firstId).not.toBeNull();

	await page.keyboard.press("ArrowUp");
	expect(await focusedEventId(page), "Up must clamp at the first grid action.").toBe(firstId);
	await page.keyboard.press("ArrowDown");
	expect(await focusedEventId(page), "Down must move to the next grid event action.").not.toBe(firstId);

	await page.keyboard.press("Escape");
	await expect(selectedDay).toBeFocused();
	await expectOnlyOneGridTabStop(grid);
});

test("managed action mode has deterministic forward and reverse Tab exits", async ({ page }) => {
	const grid = page.getByRole("grid");
	const selectedDay = grid.locator('[role="gridcell"][aria-selected="true"] > button');
	await selectedDay.focus();
	await selectedDay.press("F2");
	await expect(focusedGridEventAction(page)).toHaveCount(1);

	await page.keyboard.press("Shift+Tab");
	await expect(selectedDay).toBeFocused();

	await selectedDay.press("F2");
	await page.keyboard.press("Tab");
	await expect.poll(() => grid.evaluate((element) => !element.contains(document.activeElement))).toBe(true);
});

test("activating a grid event preserves day selection and opens the application dialog", async ({ page }) => {
	const grid = page.getByRole("grid");
	const selectedCell = grid.locator('[role="gridcell"][aria-selected="true"]');
	const selectedDayName = await selectedCell.locator(":scope > button").getAttribute("aria-label");
	const action = gridEventActions(page).first();
	await expect(action).toBeVisible();
	await action.click();

	await expect(page.locator("[data-example-event-dialog]")).toBeVisible();
	await expect(grid.locator('[role="gridcell"][aria-selected="true"] > button'))
		.toHaveAttribute("aria-label", selectedDayName ?? "");
});

test("compact layout retains a keyboard-operable grid event target", async ({ page }) => {
	await page.setViewportSize({ height: 844, width: 390 });
	const action = gridEventActions(page).first();
	await expect(action).toBeVisible();
	await expect(action).toHaveAccessibleName(/.+/u);
	const box = await action.boundingBox();
	expect(box).not.toBeNull();
	expect(Math.abs((box?.width ?? 0) - 44)).toBeLessThanOrEqual(1);
	expect(Math.abs((box?.height ?? 0) - 44)).toBeLessThanOrEqual(1);
	await action.focus();
	await expect(action).toBeFocused();
	await action.press("Enter");
	await expect(page.locator("[data-example-event-dialog]")).toBeVisible();
});
