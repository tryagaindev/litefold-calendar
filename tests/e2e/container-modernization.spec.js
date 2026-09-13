import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { expectLibraryFixtureReady } from "./helpers.js";

const TARGET_DATE = "2026-08-06";

test.use({ bypassCSP: true });

for (const [name, features] of [
	["native", []],
	["without relational selectors", ["has"]],
	["without subgrid", ["subgrid"]],
	["combined fallbacks", ["has", "dir", "subgrid"]]
]) {
	test(`nested calendar containers preserve counts, focus and role layout (${name})`, async ({ page }) => {
		if (features.length > 0) { await disableModernLayoutFeatures(page, features); }
		await mountCalendars(page);
		const compact = page.locator("#my-audit-compact");
		const wide = page.locator("#my-audit-wide");
		const compactCount = countFor(compact);
		await expect(compactCount).toBeVisible();
		await expect(countFor(wide)).toBeHidden();
		await expect(compactCount).toHaveCSS("border-top-style", "solid");
		for (const host of [compact, wide]) {
			await expectNoOverflow(host);
			await expect(host.locator(".lfc-calendar-agenda-event")).toHaveCount(2);
			await expect(host.locator(".lfc-calendar-agenda-event").first()).toHaveCSS("display", features.includes("has") ? "flex" : "grid");
			if (features.includes("subgrid")) {
				await expect(host.locator(".lfc-calendar-agenda-item").first()).not.toHaveCSS("grid-template-columns", /subgrid/u);
			}
			await expect(host.locator(".lfc-calendar-agenda-event .lfc-calendar-event-details:visible")).toHaveCount(0);
			for (const title of await host.locator(".lfc-calendar-agenda-event .lfc-calendar-event-title").all()) {
				await expect(title).toBeVisible();
				await expectNoOverflow(title);
			}
		}
		await compact.locator(`.lfc-calendar-day-button[data-lfc-date="${TARGET_DATE}"]`).focus();
		await page.keyboard.press("F2");
		await expect(compactCount).toBeFocused();
		await compact.evaluate((host) => { host.style.inlineSize = "900px"; });
		await expect(compactCount).toBeFocused();
		await expect(compactCount).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(compactCount).toBeHidden();
		await compact.evaluate((host) => { host.style.inlineSize = "320px"; });
		await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
		await expectNoOverflow(compact);
		await expect(compactCount).toBeVisible();
		expect(await page.evaluate(() => window.containerAudit.requests)).toBe(2);
	});
}

test("direction fallback follows nested ancestor changes without replacing focused controls", async ({ page }) => {
	await disableModernLayoutFeatures(page);
	await mountCalendars(page);
	const host = page.locator("#my-audit-compact");
	const count = countFor(host);
	await count.focus();
	await host.evaluate((host) => {
		const outer = document.createElement("section");
		outer.dir = "rtl";
		const inner = document.createElement("section");
		inner.dir = "ltr";
		host.before(outer);
		outer.append(inner);
		inner.append(host);
	});
	await count.focus();
	await expect(host.locator(".lfc-calendar-grid")).toHaveCSS("direction", "ltr");
	await host.evaluate((host) => { host.parentElement.removeAttribute("dir"); });
	await expect(host.locator(".lfc-calendar-grid")).toHaveCSS("direction", "rtl");
	await expect(host.locator(".lfc-calendar-swipe-lane-previous")).toHaveCSS("order", "3");
	await expect(count).toBeFocused();
	await host.evaluate((host) => { host.parentElement.style.direction = "ltr"; });
	await expect(host.locator(".lfc-calendar-grid")).toHaveCSS("direction", "ltr");
	await expect(host.locator(".lfc-calendar-swipe-lane-previous")).toHaveCSS("order", "1");
	await expect(count).toBeFocused();
	await host.evaluate((host) => { host.dir = "rtl"; });
	await expect(host.locator(".lfc-calendar-grid")).toHaveCSS("direction", "rtl");
	await expect(count).toBeFocused();
	await host.evaluate((host) => {
		host.removeAttribute("dir");
		host.parentElement.style.removeProperty("direction");
		const text = document.createElement("span");
		text.id = "my-audit-direction-text";
		text.textContent = "\u05d0\u05d1\u05d2";
		host.parentElement.prepend(text);
	});
	await expect(host.locator(".lfc-calendar-grid")).toHaveCSS("direction", "rtl");
	await host.evaluate((host) => { host.parentElement.dir = "auto"; });
	await page.locator("#my-audit-direction-text").evaluate((text) => { text.firstChild.data = "English text"; });
	await expect(host.locator(".lfc-calendar-grid")).toHaveCSS("direction", "ltr");
	await expect(count).toBeFocused();
	await page.evaluate(() => { window.containerAudit.calendars[0].destroy(); });
	await expect(host).not.toHaveAttribute("data-lfc-direction");
});

test("example panels use their own named container when nested in a wide shell", async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 1000 });
	await expectLibraryFixtureReady(page);
	await addSourceStyles(page, ["examples/example.css"]);
	await page.evaluate(() => {
		const shell = document.createElement("main");
		shell.className = "my-shell";
		const panel = document.createElement("section");
		panel.className = "my-panel";
		panel.style.inlineSize = "320px";
		const row = document.createElement("div");
		row.className = "my-control-row";
		const label = document.createElement("label");
		label.textContent = "Category";
		const input = document.createElement("input");
		input.className = "my-field";
		input.setAttribute("aria-label", "Category filter");
		const button = document.createElement("button");
		button.className = "my-button";
		button.textContent = "Refresh events";
		row.append(label, input, button);
		panel.append(row);
		shell.append(panel);
		document.body.replaceChildren(shell);
	});
	const panel = page.locator(".my-panel");
	const label = panel.locator("label");
	const input = panel.getByRole("textbox");
	await input.focus();
	await expect.poll(async () => {
		const [labelBox, inputBox] = await Promise.all([label.boundingBox(), input.boundingBox()]);
		return inputBox.y >= labelBox.y + labelBox.height;
	}).toBe(true);
	await expectNoOverflow(panel);
	await panel.evaluate((panel) => { panel.style.inlineSize = "700px"; });
	await expect(input).toBeFocused();
	await expect.poll(async () => {
		const [labelBox, inputBox] = await Promise.all([label.boundingBox(), input.boundingBox()]);
		return Math.abs(inputBox.y - labelBox.y) < inputBox.height;
	}).toBe(true);
});

test("published site sections reflow independently and leave the skip link fixed to the viewport", async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 1000 });
	await expectLibraryFixtureReady(page);
	const source = await readFile(new URL("../../scripts/pages-site/index.html", import.meta.url), "utf8");
	await page.setContent(source.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "")
		.replaceAll(/<link\b[^>]*>/gu, ""));
	await addSourceStyles(page, ["scripts/pages-site/site.css"]);
	await page.addStyleTag({ content: ".my-pages-site-header, .my-pages-footer { inline-size: 320px; } body { min-block-size: 2000px; }" });
	const header = page.locator(".my-pages-site-header");
	const footer = page.locator(".my-pages-footer");
	for (const section of [header, footer]) { await expectNoOverflow(section); }
	await expect.poll(async () => {
		const [wordmark, links] = await Promise.all([
			header.locator(".my-pages-wordmark").boundingBox(),
			header.locator(".my-pages-project-nav ul").boundingBox()
		]);
		return links.y >= wordmark.y + wordmark.height;
	}).toBe(true);
	await expect.poll(async () => {
		const [heading, metadata] = await Promise.all([footer.locator("h2").boundingBox(), footer.locator("dl").boundingBox()]);
		return metadata.y >= heading.y + heading.height;
	}).toBe(true);
	await page.evaluate(() => { window.scrollTo(0, 250); });
	const skip = page.getByRole("link", { name: "Skip to main content" });
	await skip.focus();
	await expect(skip).toBeFocused();
	const box = await skip.boundingBox();
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeLessThan(32);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});

function countFor(host) {
	return host.locator(`.lfc-calendar-grid-more[data-lfc-date="${TARGET_DATE}"]`);
}

async function expectNoOverflow(locator) {
	await expect.poll(() => locator.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

async function addSourceStyles(page, files) {
	for (const file of files) {
		await page.addStyleTag({ content: await readFile(new URL(`../../${file}`, import.meta.url), "utf8") });
	}
}

async function disableModernLayoutFeatures(page, features = ["dir", "has", "subgrid"]) {
	await page.addInitScript((features) => {
		const supports = CSS.supports.bind(CSS);
		CSS.supports = (...values) => values.some((value) => features.some((feature) =>
			value.includes(feature === "subgrid" ? "subgrid" : `:${feature}(`)))
			? false : supports(...values);
	}, features);
	await page.route("**/*.css", async (route) => {
		const response = await route.fetch();
		let body = await response.text();
		for (const feature of features) {
			body = feature === "subgrid" ? body.replaceAll("subgrid", "lfc-unsupported-subgrid")
				: body.replaceAll(`:${feature}(`, `:lfc-unsupported-${feature}(`);
		}
		await route.fulfill({ body, response });
	});
}

async function mountCalendars(page) {
	await page.setViewportSize({ width: 1200, height: 1200 });
	await expectLibraryFixtureReady(page);
	await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const fixture = { calendars: [], requests: 0 };
		for (const [name, width] of [["compact", 320], ["wide", 900]]) {
			const host = document.createElement("div");
			host.id = `my-audit-${name}`;
			host.style.inlineSize = `${String(width)}px`;
			document.body.append(host);
			const calendar = createCalendar(host, {
				eventTimeDisplay: name === "compact" ? "none" : "all",
				events: () => {
					fixture.requests += 1;
					return [{ id: "timed", title: "A long event title that wraps safely", start: "2026-08-06T09:00" },
						{ id: "all-day", title: "All-day activity", start: "2026-08-06" }];
				},
				initialDate: "2026-08-06",
				locale: "en-US",
				now: () => new Date("2026-08-06T12:00:00Z"),
				onEventActivate: () => {},
				renderHooks: [{ id: "audit-empty-marker", renderEventMarker: ({ event }) => event.id === "all-day" ? null : undefined }]
			});
			calendar.render();
			fixture.calendars.push(calendar);
		}
		window.containerAudit = fixture;
	});
	await expect(page.locator("#my-audit-compact")).not.toHaveAttribute("aria-busy", "true");
	await expect(page.locator("#my-audit-wide")).not.toHaveAttribute("aria-busy", "true");
}
