import { expect, test } from "@playwright/test";
import { expectExampleReady, expectLibraryFixtureReady } from "./helpers.js";

const ACTION = '.lfc-calendar-grid-more[data-lfc-date="2026-07-14"]';
const TOKENS = ["background", "color", "border-color", "border-width", "border-radius", "font-size", "min-block-size", "compact-inline-size"];
const THEME = `--lfc-grid-overflow-background: rgb(220, 230, 240); --lfc-grid-overflow-color: rgb(20, 30, 40);
	--lfc-grid-overflow-border-color: rgb(90, 100, 110); --lfc-grid-overflow-border-width: 3px;
	--lfc-grid-overflow-border-radius: 6px; --lfc-grid-overflow-font-size: 20px;
	--lfc-grid-overflow-min-block-size: 60px; --lfc-grid-overflow-compact-inline-size: 70px;`;

async function mount(page, settings = {}) {
	await page.setViewportSize({ width: 1200, height: 1200 });
	await expectLibraryFixtureReady(page);
	await page.route("**/overflow-theme.css", (route) => route.fulfill({ contentType: "text/css", body: `
		html { font-size: ${settings.enlarged ? "32" : "16"}px; }
		[data-my-calendar] { inline-size: ${settings.width ?? 800}px; }
		[data-my-calendar].narrow { inline-size: 320px; }
		.themed { ${settings.theme ?? THEME} }
		.event-theme { --lfc-event-background: rgb(240, 220, 240); --lfc-event-color: rgb(40, 10, 40); --lfc-event-border-color: rgb(120, 60, 120); }
		.reset { ${TOKENS.map((name) => `--lfc-grid-overflow-${name}: initial;`).join(" ")} }
		.explicit-content { font-size: 17px; color: rgb(100, 20, 40); }
	` }));
	await page.evaluate(async (settings) => {
		window.themeViolations = [];
		document.addEventListener("securitypolicyviolation", (event) => { window.themeViolations.push(event.violatedDirective); });
		await new Promise((resolve, reject) => {
			const link = document.createElement("link");
			link.rel = "stylesheet"; link.href = "/overflow-theme.css";
			link.onload = resolve; link.onerror = reject; document.head.append(link);
		});
		const { createCalendar } = await import("/dist/index.js");
		const host = document.querySelector("[data-my-calendar]");
		if (settings.rtl) { host.dir = "rtl"; }
		const fixture = { host, requests: 0, hooks: 0, errors: [] };
		fixture.calendar = createCalendar(host, {
			initialDate: "2026-07-14", now: () => new Date("2026-07-14T12:00:00Z"),
			gridEventDisplay: settings.display ?? { compact: "count", wide: "count" },
			weekRowSizing: settings.rows ?? "equal", maxGridEventsPerDay: settings.limit ?? 1, agendaPageSize: 10,
			events: () => {
				fixture.requests += 1;
				return Array.from({ length: 12 }, (_, i) => ({ id: String(i), start: "2026-07-14", title: `Event ${String(i)}` }));
			},
			onEventActivate: () => {}, onError: (error) => { fixture.errors.push(error.code); },
			renderHooks: [{ id: "overflow-theme-fixture", renderEventOverflow: () => {
				fixture.hooks += 1;
				if (settings.suppressOverflow) { return null; }
				if (!settings.custom) { return undefined; }
				const content = document.createElement("span");
				content.className = settings.custom === "explicit" ? "explicit-content" : "inherited-content";
				content.textContent = settings.custom === "long" ? "123456789012345678901234567890" : "Custom count";
				return content;
			} }]
		});
		window.themeFixture = fixture;
		fixture.calendar.render();
	}, settings);
	await expect.poll(() => page.evaluate(() => window.themeFixture.calendar.getState().phase)).toBe("ready");
}

async function styles(locator) {
	return locator.evaluate((element) => {
		const css = getComputedStyle(element);
		return Object.fromEntries(["backgroundColor", "color", "borderTopWidth", "borderTopColor", "borderTopStyle", "borderRadius", "fontSize", "minBlockSize", "inlineSize"].map((name) => [name, css[name]]));
	});
}
async function theme(page, className = "themed") {
	await page.locator("[data-my-calendar]").evaluate((host, className) => { host.classList.add(className); }, className);
}

for (const width of [320, 800]) {
	test(`eight tokens are isolated to overflow at ${String(width)}px`, async ({ page }) => {
		await mount(page, { width });
		const unrelated = page.locator(".lfc-calendar-agenda-item").first();
		const pagination = page.locator(".lfc-calendar-agenda-more");
		const before = { event: await styles(unrelated), more: await styles(pagination), action: await styles(page.locator(ACTION)) };
		await theme(page);
		const action = await styles(page.locator(ACTION));
		expect(action).toMatchObject({ backgroundColor: "rgb(220, 230, 240)", color: "rgb(20, 30, 40)",
			borderTopColor: "rgb(90, 100, 110)", borderTopWidth: "3px", borderTopStyle: "solid", borderRadius: "6px", minBlockSize: "60px" });
		const variant = page.locator(`${ACTION} > .lfc-calendar-event-overflow.lfc-is-${width === 320 ? "compact" : "wide"}`);
		expect(await styles(variant)).toMatchObject({ backgroundColor: "rgba(0, 0, 0, 0)", borderTopWidth: "0px", fontSize: "20px" });
		expect(await styles(unrelated)).toEqual(before.event);
		expect(await styles(pagination)).toEqual(before.more);
		await expect(page.locator(`${ACTION} :is(button,a,[tabindex])`)).toHaveCount(0);
		await expect(page.locator(ACTION)).toHaveCount(1);
		expect(await page.locator("[data-my-calendar] [style]").count()).toBe(0);
		expect(await page.evaluate(() => window.themeViolations)).toEqual([]);
		await theme(page, "reset");
		expect(await styles(page.locator(ACTION))).toEqual(before.action);
	});
}

for (const display of [{ compact: "count", wide: "events" }, { compact: "events", wide: "count" }, { compact: "events", wide: "events" }]) {
	test(`relative typography and contextual paint ${JSON.stringify(display)}`, async ({ page }) => {
		await mount(page, { display, theme: "--lfc-grid-overflow-font-size: .8em; --lfc-grid-overflow-border-width: 2px;" });
		const button = page.locator(ACTION);
		const before = await styles(button);
		await theme(page);
		expect(await styles(button)).toMatchObject({ borderTopWidth: "2px", borderTopStyle: "solid", color: before.color, backgroundColor: before.backgroundColor });
		for (const variant of ["wide", "compact"]) {
			const root = page.locator(`${ACTION} > .lfc-is-${variant}`);
			if (await root.count()) {
				const font = Number.parseFloat((await styles(root)).fontSize);
				expect(font).toBeCloseTo(Number.parseFloat((await styles(button)).fontSize) * .8, 2);
			}
		}
	});
}

for (const rows of ["equal", "content"]) {
	test(`enlarged passive cue preserves event styling and safely stacks in ${rows} rows`, async ({ page }) => {
		await mount(page, { width: 390, rows, display: { compact: "events", wide: "events" } });
		const marker = page.locator('.lfc-calendar-event-overflow-cluster > .lfc-calendar-event-summary[data-lfc-date="2026-07-14"]').first();
		const cue = page.locator(".lfc-calendar-event-overflow-cluster > .lfc-calendar-event-overflow").first();
		const markerBefore = await styles(marker);
		await theme(page);
		expect(await styles(marker)).toEqual(markerBefore);
		expect(await styles(cue)).toMatchObject({ backgroundColor: "rgb(220, 230, 240)", color: "rgb(20, 30, 40)", borderTopWidth: "3px", minBlockSize: "60px", fontSize: "20px" });
		expect(await cue.evaluate((element) => ({ role: element.getAttribute("role"), tab: element.getAttribute("tabindex"), pointer: getComputedStyle(element).pointerEvents }))).toEqual({ role: null, tab: null, pointer: "none" });
		const cueBox = await cue.boundingBox();
		const eventBox = await marker.boundingBox();
		expect(cueBox.y).toBeGreaterThanOrEqual(eventBox.y + eventBox.height - 1);
	});
}

for (const custom of ["inherited", "explicit", "long"]) {
	test(`custom ${custom} content with RTL and enlarged text reflows`, async ({ page }) => {
		await mount(page, { width: 320, custom, rtl: true, enlarged: true });
		await theme(page);
		const button = page.locator(ACTION);
		const content = button.locator(`.lfc-is-compact .${custom === "explicit" ? "explicit-content" : "inherited-content"}`);
		expect((await styles(content)).fontSize).toBe(custom === "explicit" ? "17px" : "20px");
		const geometry = await button.evaluate((element) => {
			const cell = element.closest(".lfc-calendar-day");
			const rect = element.getBoundingClientRect(); const owner = cell.getBoundingClientRect();
			return { left: rect.left, right: rect.right, ownerLeft: owner.left, ownerRight: owner.right,
				height: rect.height, width: rect.width, scroll: element.scrollWidth, client: element.clientWidth };
		});
		expect(geometry.left).toBeGreaterThanOrEqual(geometry.ownerLeft - 1);
		expect(geometry.right).toBeLessThanOrEqual(geometry.ownerRight + 1);
		expect(geometry.height).toBeGreaterThanOrEqual(geometry.width - 1);
		expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
	});
}

test("borderless keyboard focus survives resize without replacing nodes or fetching", async ({ page }) => {
	await mount(page, { display: { compact: "events", wide: "count" }, theme: "--lfc-grid-overflow-border-width: 0; --lfc-grid-overflow-min-block-size: 90px;" });
	await theme(page);
	const button = page.locator(ACTION);
	await page.locator('.lfc-calendar-day-button[data-lfc-date="2026-07-14"]').press("F2");
	await expect(button).toBeFocused();
	const before = await page.evaluate(() => {
		window.savedOverflow = document.activeElement;
		return { requests: window.themeFixture.requests, hooks: window.themeFixture.hooks };
	});
	await theme(page, "narrow");
	await expect(button).toBeFocused();
	await expect(button).toBeVisible();
	await expect(button).toHaveCSS("border-top-width", "0px");
	expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
	expect(await page.evaluate(() => ({ requests: window.themeFixture.requests, hooks: window.themeFixture.hooks,
		same: document.activeElement === window.savedOverflow }))).toEqual({ ...before, same: true });
	await page.locator(".lfc-calendar-agenda-title").focus();
	await expect(button).toHaveCSS("min-block-size", "0px");
	await expect(button).toHaveCSS("pointer-events", "none");
	await expect(button).toHaveCSS("clip-path", "inset(50%)");
	await expect(button).toHaveAttribute("tabindex", "-1");
});

test("single paint overrides coexist with generic event themes and remain host-local", async ({ page }) => {
	await mount(page, { theme: "--lfc-grid-overflow-border-color: rgb(1, 2, 3); --lfc-grid-overflow-background: rgb(4, 5, 6);" });
	await theme(page, "event-theme");
	await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const second = document.createElement("div"); second.id = "my-second";
		document.body.append(second);
		const calendar = createCalendar(second, { initialDate: "2026-07-14", events: [
			{ id: "other", start: "2026-07-14", title: "Other" }
		], gridEventDisplay: { compact: "count", wide: "count" } });
		calendar.render();
	});
	const other = page.locator(`#my-second ${ACTION}`);
	const first = page.locator(`[data-my-calendar] ${ACTION}`);
	const baseline = await styles(first);
	expect(baseline).toMatchObject({ backgroundColor: "rgb(240, 220, 240)", color: "rgb(40, 10, 40)", borderTopColor: "rgb(120, 60, 120)" });
	const event = page.locator(".lfc-calendar-agenda-event").first();
	await expect(event).toHaveCSS("background-color", "rgb(240, 220, 240)");
	await expect(event).toHaveCSS("border-top-color", "rgb(120, 60, 120)");
	const eventBefore = await styles(event);
	const otherBefore = await styles(other);
	await theme(page);
	const after = await styles(first);
	expect(after).toMatchObject({ backgroundColor: "rgb(4, 5, 6)", borderTopColor: "rgb(1, 2, 3)", color: baseline.color });
	expect(await styles(other)).toEqual(otherBefore);
	expect(await styles(event)).toEqual(eventBefore);
});

test("small token values retain target floors and larger preferred width grows only counts", async ({ page }) => {
	await mount(page, { width: 650, theme: "--lfc-grid-overflow-min-block-size: 1px; --lfc-grid-overflow-compact-inline-size: 70px;" });
	await theme(page);
	const button = page.locator(ACTION);
	expect((await button.boundingBox()).width).toBeCloseTo(70, 0);
	expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(70);
	await theme(page, "narrow");
	const box = await button.boundingBox();
	expect(box.width).toBeGreaterThanOrEqual(24);
	expect(box.width).toBeLessThan(70);
	expect(box.height).toBeGreaterThanOrEqual(24);
});

for (const preferences of [
	{ colorScheme: "light", contrast: "more", reducedMotion: "reduce" },
	{ colorScheme: "dark", reducedMotion: "reduce" },
	{ forcedColors: "active", reducedMotion: "reduce" }
]) {
	test(`advanced overflow theme respects preferences ${JSON.stringify(preferences)}`, async ({ page }) => {
		await page.emulateMedia(preferences);
		await page.setViewportSize({ width: 390, height: 844 });
		await expectExampleReady(page, "/examples/advanced/");
		const action = page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-08-06"]');
		await page.locator('.lfc-calendar-day-button[data-lfc-date="2026-08-06"]').press("F2");
		await expect(action).toBeFocused();
		expect(await action.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
		expect(await action.evaluate((element) => {
			const css = getComputedStyle(element);
			return css.color !== css.backgroundColor;
		})).toBe(true);
		if (preferences.forcedColors === "active") { await expect(action).toHaveCSS("border-top-width", "1px"); }
		else { await expect(action).toHaveCSS("border-top-width", "0px"); }
	});
}

test("wide custom overflow text grows inside its owning day", async ({ page }) => {
	await mount(page, { width: 800, custom: "long", display: { compact: "events", wide: "events" } });
	await theme(page);
	const action = page.locator(ACTION);
	expect(await action.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
	const content = action.locator(".lfc-is-wide .inherited-content");
	const text = await content.boundingBox();
	const button = await action.boundingBox();
	expect(text.x).toBeGreaterThanOrEqual(button.x);
	expect(text.x + text.width).toBeLessThanOrEqual(button.x + button.width + 1);
});

test("suppressed passive cues do not reserve a themed minimum block", async ({ page }) => {
	await mount(page, { width: 320, suppressOverflow: true, display: { compact: "events", wide: "events" } });
	const cue = page.locator(".lfc-calendar-event-overflow-cluster > .lfc-calendar-event-overflow").first();
	const summaries = cue.locator("../..");
	const before = await summaries.boundingBox();
	await theme(page);
	await expect(cue).toBeHidden();
	expect((await summaries.boundingBox()).height).toBeCloseTo(before.height, 0);
});

for (const width of [320, 640, 1100]) {
	test(`default day padding is compact without shrinking targets at ${String(width)}px`, async ({ page }) => {
		await mount(page, { width });
		const day = page.locator('.lfc-calendar-day-button[data-lfc-date="2026-07-14"]');
		const padding = await day.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
		expect(padding).toBeCloseTo(Math.max(4, Math.min(8, (width - 2) * .0075)), 1);
		const action = await page.locator(ACTION).boundingBox();
		expect(action.width).toBeGreaterThanOrEqual(24);
		expect(action.height).toBeGreaterThanOrEqual(24);
	});
}
