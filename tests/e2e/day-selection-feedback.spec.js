import { expect, test } from "@playwright/test";

import { expectExampleReady, expectOnlyOneGridTabStop } from "./helpers.js";

const ANIMATION_NAME = "lfc-day-selection-reveal";
const CONFIRM_ANIMATION_NAME = "lfc-day-selection-confirm";
const FEEDBACK_ANIMATION_NAMES = [ANIMATION_NAME, CONFIRM_ANIMATION_NAME].sort();
const TARGET_DATE = "2026-08-31";
const SECOND_TARGET_DATE = "2026-08-30";

test.describe("when motion is allowed", () => {
	test.use({ reducedMotion: "no-preference" });

	test("an immediate pointer click produces one coherent selection transition with a seamless cleanup", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const target = grid.locator(`button[data-lfc-date="${TARGET_DATE}"]`);
		await armSelectionProbe(target);
		const targetCenter = await dayNumberCenter(target);
		await page.mouse.move(targetCenter.x, targetCenter.y);
		await page.mouse.down();
		await capturePressedStyle(target);
		await page.mouse.up();

		const selectedCell = grid.locator(`[role="gridcell"]:has(> button[data-lfc-date="${TARGET_DATE}"])`);
		const selectedButton = selectedCell.locator(":scope > .lfc-calendar-day-button");
		await expect(selectedCell).toHaveAttribute("aria-selected", "true");
		await expect(selectedCell).toHaveClass(/\blfc-is-selection-entry\b/u);
		await expect(selectedButton).toBeFocused();
		await expectOnlyOneGridTabStop(grid);

		const probe = await readSelectionTimeline(selectedButton);
		expect(probe.pointerType).toBe("mouse");
		expect(probe.pointerTrusted).toBe(true);
		expect(probe.press).not.toBeNull();
		expect(probe.press?.background).toBe(probe.selectedBackground);
		expect(probe.press?.border).toBe(probe.accentColor);
		expect(probe.animationCount).toBe(FEEDBACK_ANIMATION_NAMES.length);
		expect(probe.animationNames).toEqual(FEEDBACK_ANIMATION_NAMES);
		expect(probe.animationPseudoElement).toBeNull();
		expect(probe.animationTargetIsButton).toBe(true);
		expect(probe.confirmationPseudoElement).toBeNull();
		expect(probe.confirmationTargetIsNumber).toBe(true);
		expect(probe.duration).toBe(160);
		expect(probe.confirmationDuration).toBe(140);
		expect(probe.timingFunction).toBe("ease-out");
		expect(probe.confirmationTimingFunction).toBe("ease-out");
		expect(probe.start.background).toBe(probe.restBackground);
		expect(probe.middle.background).not.toBe(probe.start.background);
		expect(probe.middle.background).not.toBe(probe.selectedBackground);
		expect(probe.late.background).not.toBe(probe.middle.background);
		expect(probe.end.background).not.toBe(probe.late.background);
		expect(probe.start.backgroundImage).toBe("none");
		expect(probe.middle.backgroundImage).toBe("none");
		expect(probe.late.backgroundImage).toBe("none");
		expect(probe.end.backgroundImage).toBe("none");
		expect(probe.start.numberScale).toBeCloseTo(0.92, 2);
		expect(probe.middle.numberScale).toBeGreaterThan(probe.start.numberScale);
		expect(probe.late.numberScale).toBeGreaterThan(probe.middle.numberScale);
		expect(probe.end.numberScale).toBeGreaterThan(probe.late.numberScale);
		expect(probe.end.numberScale).toBeCloseTo(1, 3);
		expect(probe.start.pseudoContent).toBe("none");
		expect(probe.middle.pseudoContent).toBe("none");
		expect(probe.end.pseudoContent).toBe("none");
		expect(probe.start.button).toEqual(probe.middle.button);
		expect(probe.middle.button).toEqual(probe.late.button);
		expect(probe.late.button).toEqual(probe.end.button);
		expect(parseFloat(probe.start.button.outlineWidth)).toBeGreaterThan(0);

		await finishSelectionAnimation(selectedButton);
		await expect(selectedCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
		const settled = await readSettledVisual(selectedButton);
		expect(settled.button.background).toBe(probe.selectedBackground);
		expect(settled.button.backgroundImage).toBe("none");
		expect(settled.button.color).toBe(probe.end.button.color);
		expect(settled.button.outlineColor).toBe(probe.end.button.outlineColor);
		expect(settled.button.outlineOffset).toBe(probe.end.button.outlineOffset);
		expect(settled.button.outlineStyle).toBe(probe.end.button.outlineStyle);
		expect(settled.button.outlineWidth).toBe(probe.end.button.outlineWidth);
		expect(settled.pseudoContent).toBe("none");
		expect(settled.feedbackAnimationCount).toBe(0);
		expect(settled.numberScale).toBeCloseTo(1, 3);
		expect(await selectedCell.evaluate((cell) => cell.scrollWidth <= cell.clientWidth)).toBe(true);
	});

	test("native Today navigation stays settled while direct current-day selection transitions", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const title = page.locator(".lfc-calendar-title-label-full");
		await page.locator(".lfc-calendar-nav-button-next").click();
		await expect(title).toHaveText("September 2026");
		await page.locator(".lfc-calendar-today-button").click();
		await expect(title).toHaveText("August 2026");
		await expect(grid.locator(".lfc-is-selection-entry")).toHaveCount(0);
		expect(await selectionFeedbackAnimationCount(grid)).toBe(0);
		const settledCurrentDay = grid.locator(
			'[role="gridcell"]:has(> button[data-lfc-date="2026-08-06"])'
		);
		await expect(settledCurrentDay).toHaveAttribute("aria-selected", "true");

		const alternateDate = grid.locator(`button[data-lfc-date="${SECOND_TARGET_DATE}"]`);
		await armSelectionProbe(alternateDate);
		await alternateDate.click();
		const alternateButton = grid.locator(
			`[role="gridcell"]:has(> button[data-lfc-date="${SECOND_TARGET_DATE}"]) > button`
		);
		await finishSelectionAnimation(alternateButton);

		const currentDay = grid.locator('button[aria-current="date"]');
		await expect(currentDay).toHaveAttribute("data-lfc-date", "2026-08-06");
		await armSelectionProbe(currentDay);
		const currentDayCenter = await dayNumberCenter(currentDay);
		await page.mouse.click(currentDayCenter.x, currentDayCenter.y);
		const currentDayCell = grid.locator(
			'[role="gridcell"]:has(> button[data-lfc-date="2026-08-06"])'
		);
		const currentDayButton = currentDayCell.locator(":scope > .lfc-calendar-day-button");
		await expect(currentDayCell).toHaveAttribute("aria-selected", "true");
		await expect(currentDayCell).toHaveClass(/\blfc-is-selection-entry\b/u);
		await expect(currentDayButton).toBeFocused();
		expect(await selectionFeedbackAnimationCount(currentDayButton)).toBe(FEEDBACK_ANIMATION_NAMES.length);
		await finishSelectionAnimation(currentDayButton);
		await expect(currentDayCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
	});

	test("rapid reselection cancels stale feedback and leaves only the latest transition", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const firstTarget = grid.locator(`button[data-lfc-date="${TARGET_DATE}"]`);
		await armSelectionProbe(firstTarget);
		await firstTarget.click();
		await expect(grid.locator(".lfc-is-selection-entry")).toHaveCount(1);

		const secondTarget = grid.locator(`button[data-lfc-date="${SECOND_TARGET_DATE}"]`);
		await armSelectionProbe(secondTarget);
		await secondTarget.click();
		const latestCell = grid.locator(
			`[role="gridcell"]:has(> button[data-lfc-date="${SECOND_TARGET_DATE}"])`
		);
		const latestButton = latestCell.locator(":scope > .lfc-calendar-day-button");
		await expect(grid.locator(".lfc-is-selection-entry")).toHaveCount(1);
		await expect(latestCell).toHaveClass(/\blfc-is-selection-entry\b/u);
		await expect(latestButton).toBeFocused();
		const feedbackAnimationCount = await page.evaluate(
			(animationNames) => document.getAnimations()
				.filter((animation) => animationNames.includes(animation.animationName)).length,
			FEEDBACK_ANIMATION_NAMES
		);
		expect(feedbackAnimationCount).toBe(FEEDBACK_ANIMATION_NAMES.length);

		await finishSelectionAnimation(latestButton);
		await expect(grid.locator(".lfc-is-selection-entry")).toHaveCount(0);
	});

	test("keyboard activation receives the same transition and immediate semantics", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const target = grid.locator(`button[data-lfc-date="${TARGET_DATE}"]`);
		await target.focus();
		await armSelectionProbe(target);
		await target.press("Enter");

		const selectedCell = grid.locator(`[role="gridcell"]:has(> button[data-lfc-date="${TARGET_DATE}"])`);
		const selectedButton = selectedCell.locator(":scope > .lfc-calendar-day-button");
		await expect(selectedCell).toHaveAttribute("aria-selected", "true");
		await expect(selectedCell).toHaveClass(/\blfc-is-selection-entry\b/u);
		await expect(selectedButton).toBeFocused();
		expect(await selectedButton.evaluate((button) => button.matches(":focus-visible"))).toBe(true);
		const probe = await readSelectionTimeline(selectedButton);
		expect(probe.animationCount).toBe(FEEDBACK_ANIMATION_NAMES.length);
		expect(probe.animationNames).toEqual(FEEDBACK_ANIMATION_NAMES);
		expect(probe.start.background).toBe(probe.restBackground);
		expect(probe.middle.background).not.toBe(probe.start.background);
		expect(probe.start.numberScale).toBeCloseTo(0.92, 2);
		expect(probe.end.numberScale).toBeCloseTo(1, 3);
		expect(probe.start.button).toEqual(probe.middle.button);
		expect(probe.middle.button).toEqual(probe.late.button);
		expect(probe.late.button).toEqual(probe.end.button);
		expect(parseFloat(probe.start.button.outlineWidth)).toBeGreaterThan(0);
		await expectOnlyOneGridTabStop(grid);

		await finishSelectionAnimation(selectedButton);
		await expect(selectedCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
		const settled = await readSettledVisual(selectedButton);
		expect(settled.button.outlineColor).toBe(probe.end.button.outlineColor);
		expect(settled.button.outlineOffset).toBe(probe.end.button.outlineOffset);
		expect(settled.button.outlineStyle).toBe(probe.end.button.outlineStyle);
		expect(settled.button.outlineWidth).toBe(probe.end.button.outlineWidth);
	});
});

test.describe("with trusted touch input", () => {
	test.use({ hasTouch: true, reducedMotion: "no-preference" });

	test("a tap hands off pressed-day feedback to the selection transition", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const target = grid.locator(`button[data-lfc-date="${TARGET_DATE}"]`);
		await armSelectionProbe(target);
		const targetCenter = await dayNumberCenter(target);
		const client = await page.context().newCDPSession(page);
		await client.send("Input.dispatchTouchEvent", {
			touchPoints: [{ id: 1, x: targetCenter.x, y: targetCenter.y }],
			type: "touchStart"
		});
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => { resolve(); })));
		await capturePressedStyle(target);
		await client.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
		await client.detach();

		const selectedCell = grid.locator(`[role="gridcell"]:has(> button[data-lfc-date="${TARGET_DATE}"])`);
		const selectedButton = selectedCell.locator(":scope > .lfc-calendar-day-button");
		await expect(selectedCell).toHaveAttribute("aria-selected", "true");
		await expect(selectedCell).toHaveClass(/\blfc-is-selection-entry\b/u);
		await expect(selectedButton).toBeFocused();
		const probe = await readSelectionTimeline(selectedButton);
		expect(probe.pointerType).toBe("touch");
		expect(probe.pointerTrusted).toBe(true);
		expect(probe.press).not.toBeNull();
		expect(probe.press?.background).toBe(probe.selectedBackground);
		expect(probe.press?.border).toBe(probe.accentColor);
		expect(probe.animationCount).toBe(FEEDBACK_ANIMATION_NAMES.length);
		expect(probe.animationNames).toEqual(FEEDBACK_ANIMATION_NAMES);
		expect(probe.start.background).toBe(probe.restBackground);
		expect(probe.start.backgroundImage).toBe("none");
		expect(probe.start.numberScale).toBeCloseTo(0.92, 2);
		await expectOnlyOneGridTabStop(grid);

		await finishSelectionAnimation(selectedButton);
		await expect(selectedCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
	});
});

test.describe("when reduced motion is requested", () => {
	test.use({ reducedMotion: "reduce" });

	test("pointer and keyboard selection render their settled state immediately", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const pointerTarget = grid.locator(`button[data-lfc-date="${TARGET_DATE}"]`);
		await pointerTarget.click();

		const pointerCell = grid.locator(`[role="gridcell"]:has(> button[data-lfc-date="${TARGET_DATE}"])`);
		await expect(pointerCell).toHaveAttribute("aria-selected", "true");
		await expect(pointerCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
		expect(await selectionFeedbackAnimationCount(pointerCell.locator(":scope > button"))).toBe(0);

		const keyboardTarget = grid.locator(`button[data-lfc-date="${SECOND_TARGET_DATE}"]`);
		await keyboardTarget.focus();
		await keyboardTarget.press("Enter");
		const keyboardCell = grid.locator(
			`[role="gridcell"]:has(> button[data-lfc-date="${SECOND_TARGET_DATE}"])`
		);
		const keyboardButton = keyboardCell.locator(":scope > .lfc-calendar-day-button");
		await expect(keyboardCell).toHaveAttribute("aria-selected", "true");
		await expect(keyboardCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
		await expect(keyboardButton).toBeFocused();
		expect(await selectionFeedbackAnimationCount(keyboardButton)).toBe(0);
		await expectOnlyOneGridTabStop(grid);
	});
});

test.describe("when forced colors are active", () => {
	test.use({ forcedColors: "active", reducedMotion: "reduce" });

	test("selected and focused state remains visibly outlined without decorative feedback", async ({ page }) => {
		await expectExampleReady(page, "/examples/advanced/");
		const grid = page.getByRole("grid");
		const target = grid.locator(`button[data-lfc-date="${TARGET_DATE}"]`);
		await target.focus();
		await target.press("Enter");

		const selectedCell = grid.locator(`[role="gridcell"]:has(> button[data-lfc-date="${TARGET_DATE}"])`);
		const selectedButton = selectedCell.locator(":scope > .lfc-calendar-day-button");
		await expect(selectedCell).toHaveAttribute("aria-selected", "true");
		await expect(selectedCell).not.toHaveClass(/\blfc-is-selection-entry\b/u);
		expect(await selectionFeedbackAnimationCount(selectedButton)).toBe(0);
		await expect(selectedButton).toBeFocused();
		const focusVisual = await selectedButton.evaluate((button) => {
			const style = getComputedStyle(button);
			return {
				color: style.outlineColor,
				focusVisible: button.matches(":focus-visible"),
				style: style.outlineStyle,
				width: parseFloat(style.outlineWidth)
			};
		});
		expect(focusVisual.focusVisible).toBe(true);
		expect(focusVisual.style).toBe("solid");
		expect(focusVisual.width).toBeGreaterThan(0);
		expect(focusVisual.color).not.toBe("rgba(0, 0, 0, 0)");
		await expectOnlyOneGridTabStop(grid);
	});
});

async function armSelectionProbe(button) {
	await button.evaluate((element, animationNames) => {
		window.__lfcSelectionProbe = {
			animationError: null,
			pointerTrusted: null,
			pointerType: null,
			press: null
		};
		element.addEventListener("pointerdown", (event) => {
			const number = element.querySelector(".lfc-calendar-day-number");
			if (!(number instanceof HTMLElement)) {
				window.__lfcSelectionProbe.animationError = "Expected the pressed day number.";
				return;
			}
			const style = getComputedStyle(number);
			window.__lfcSelectionProbe.pointerTrusted = event.isTrusted;
			window.__lfcSelectionProbe.pointerType = event.pointerType;
			window.__lfcSelectionProbe.press = {
				background: style.backgroundColor,
				border: style.borderColor
			};
		}, { once: true });
		element.addEventListener("click", () => {
			const date = element.getAttribute("data-lfc-date");
			const replacement = document.querySelector(`button[data-lfc-date="${date}"]`);
			if (!(replacement instanceof HTMLButtonElement)) {
				window.__lfcSelectionProbe.animationError = "Expected the replacement selected-day button.";
				return;
			}
			const animations = replacement.getAnimations({ subtree: true })
				.filter((animation) => animationNames.includes(animation.animationName));
			if (animations.length !== animationNames.length ||
				!animations.every((animation) => animation instanceof CSSAnimation)) {
				window.__lfcSelectionProbe.animationError = "Expected both selected-day CSS animations.";
				return;
			}
			for (const animation of animations) {
				animation.pause();
			}
		}, { once: true });
	}, FEEDBACK_ANIMATION_NAMES);
}

async function readSelectionTimeline(button) {
	return button.evaluate((element, options) => {
		const probe = window.__lfcSelectionProbe;
		if (probe?.animationError) {
			throw new Error(probe.animationError);
		}
		const animations = element.getAnimations({ subtree: true })
			.filter((animation) => options.animationNames.includes(animation.animationName));
		const selection = animations.find((animation) => animation.animationName === options.animationName);
		const confirmation = animations.find(
			(animation) => animation.animationName === options.confirmAnimationName
		);
		if (!(selection instanceof CSSAnimation) || selection.effect === null) {
			throw new Error("Expected the paused selected-day fill animation.");
		}
		if (!(confirmation instanceof CSSAnimation) || confirmation.effect === null) {
			throw new Error("Expected the paused selected-day number animation.");
		}
		selection.pause();
		confirmation.pause();
		const duration = Number(selection.effect.getTiming().duration);
		const confirmationDuration = Number(confirmation.effect.getTiming().duration);
		const number = element.querySelector(".lfc-calendar-day-number");
		if (!(number instanceof HTMLElement)) {
			throw new Error("Expected the selected day number.");
		}
		const readButton = () => {
			const style = getComputedStyle(element);
			return {
				color: style.color,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth
			};
		};
		const readFrame = (time) => {
			selection.currentTime = time;
			confirmation.currentTime = Math.min(
				time,
				Math.max(0, confirmationDuration - 0.01)
			);
			const style = getComputedStyle(element);
			const numberScale = Number.parseFloat(getComputedStyle(number).scale);
			if (!Number.isFinite(numberScale)) {
				throw new Error("Expected a numeric selected-day number scale.");
			}
			return {
				background: style.backgroundColor,
				backgroundImage: style.backgroundImage,
				button: readButton(),
				numberScale,
				pseudoContent: getComputedStyle(element, "::after").content
			};
		};
		const colorProbe = document.createElement("span");
		colorProbe.style.color = "var(--lfc-selected-background)";
		element.append(colorProbe);
		const selectedBackground = getComputedStyle(colorProbe).color;
		colorProbe.style.color = "var(--lfc-accent-color)";
		const accentColor = getComputedStyle(colorProbe).color;
		colorProbe.style.color = "var(--lfc-internal-day-rest-background)";
		const restBackground = getComputedStyle(colorProbe).color;
		colorProbe.remove();
		const start = readFrame(0);
		const middle = readFrame(duration / 2);
		const late = readFrame(duration * 0.75);
		const end = readFrame(Math.max(0, duration - 0.01));
		return {
			accentColor,
			animationCount: animations.length,
			animationNames: animations.map((animation) => animation.animationName).sort(),
			animationPseudoElement: selection.effect.pseudoElement ?? null,
			animationTargetIsButton: selection.effect.target === element,
			confirmationDuration,
			confirmationPseudoElement: confirmation.effect.pseudoElement ?? null,
			confirmationTargetIsNumber: confirmation.effect.target === number,
			confirmationTimingFunction: getComputedStyle(number).animationTimingFunction,
			duration,
			end,
			late,
			middle,
			pointerTrusted: probe?.pointerTrusted ?? null,
			pointerType: probe?.pointerType ?? null,
			press: probe?.press ?? null,
			restBackground,
			selectedBackground,
			start,
			timingFunction: getComputedStyle(element).animationTimingFunction
		};
	}, {
		animationName: ANIMATION_NAME,
		animationNames: FEEDBACK_ANIMATION_NAMES,
		confirmAnimationName: CONFIRM_ANIMATION_NAME
	});
}

async function readSettledVisual(button) {
	return button.evaluate((element, animationNames) => {
		const style = getComputedStyle(element);
		const number = element.querySelector(".lfc-calendar-day-number");
		if (!(number instanceof HTMLElement)) {
			throw new Error("Expected the settled selected-day number.");
		}
		return {
			button: {
				background: style.backgroundColor,
				backgroundImage: style.backgroundImage,
				color: style.color,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth
			},
			numberScale: Number.parseFloat(getComputedStyle(number).scale),
			pseudoContent: getComputedStyle(element, "::after").content,
			feedbackAnimationCount: element.getAnimations({ subtree: true })
				.filter((animation) => animationNames.includes(animation.animationName)).length
		};
	}, FEEDBACK_ANIMATION_NAMES);
}

async function finishSelectionAnimation(button) {
	await button.evaluate((element, animationName) => {
		const animation = element.getAnimations({ subtree: true })
			.find((candidate) => candidate.animationName === animationName);
		if (!(animation instanceof CSSAnimation)) {
			throw new Error("Expected the selected-day CSS animation.");
		}
		animation.finish();
		animation.cancel();
	}, ANIMATION_NAME);
}

async function capturePressedStyle(button) {
	await button.locator(".lfc-calendar-day-number").evaluate((number) => {
		if (window.__lfcSelectionProbe === undefined) {
			throw new Error("Expected an armed selection probe.");
		}
		const style = getComputedStyle(number);
		window.__lfcSelectionProbe.press = {
			background: style.backgroundColor,
			border: style.borderColor
		};
	});
}

async function dayNumberCenter(button) {
	await button.scrollIntoViewIfNeeded();
	const bounds = await button.locator(".lfc-calendar-day-number").boundingBox();
	if (bounds === null) {
		throw new Error("Expected visible day-number bounds.");
	}
	return {
		x: bounds.x + (bounds.width / 2),
		y: bounds.y + (bounds.height / 2)
	};
}

async function selectionFeedbackAnimationCount(button) {
	return button.evaluate(
		(element, animationNames) => element.getAnimations({ subtree: true })
			.filter((animation) => animationNames.includes(animation.animationName)).length,
		FEEDBACK_ANIMATION_NAMES
	);
}
