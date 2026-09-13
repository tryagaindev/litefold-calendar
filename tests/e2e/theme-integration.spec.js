import { expect, test } from "@playwright/test";

import { useBaselineFallbacks } from "./baseline-fallbacks.js";
import { expectLibraryFixtureReady } from "./helpers.js";

test.use({ bypassCSP: true });

async function mountThemeFixture(page, detached = false) {
	await expectLibraryFixtureReady(page);
	await page.addStyleTag({ content: `
		@layer lfc, my.application;
		@layer my.application {
			.my-light { color-scheme: light; }
			.my-dark { color-scheme: dark; }
			.my-inherit { color-scheme: inherit; }
			body[data-my-theme="dark"] { color-scheme: dark; }
			body[data-my-theme="light"] { color-scheme: light; }
		}
	` });
	await page.evaluate(async (deferMount) => {
		const { createCalendar } = await import("/dist/index.js");
		const host = document.querySelector("[data-my-calendar]");
		if (deferMount) { host.remove(); }
		const observations = { requests: 0 };
		const calendar = createCalendar(host, {
			initialDate: "2026-08-06",
			events: () => {
				observations.requests += 1;
				return [{ id: "theme-event", start: "2026-08-06T09:00", title: "Theme review" }];
			}
		});
		calendar.render();
		window.__lfcTheme = { calendar, host, observations };
	}, detached);
}

async function expectPalette(host, scheme) {
	const dark = scheme === "dark";
	const background = dark ? "rgb(6, 26, 35)" : "rgb(247, 252, 252)";
	await expect(host).toHaveCSS("background-color", background);
	await expect(host).toHaveCSS("color", dark ? "rgb(234, 247, 247)" : "rgb(16, 42, 54)");
	await expect(host.locator(".lfc-calendar-agenda")).toHaveCSS("background-color",
		dark ? "rgb(12, 42, 52)" : "rgb(233, 244, 245)");
	await expect(host.locator(".lfc-calendar-agenda-event")).toHaveCSS("background-color",
		dark ? "rgb(40, 40, 83)" : "rgb(239, 238, 255)");
	await expect(host.locator(".lfc-calendar-month-picker")).toHaveCSS("background-color", background);
}

for (const fallback of [false, true]) {
	test.describe(fallback ? "Baseline palette" : "native palette", () => {
		test.beforeEach(async ({ page }) => {
			if (fallback) { await useBaselineFallbacks(page); }
		});

		test("system and host schemes preserve focused picker state and resume automatic mode", async ({ page }) => {
			await mountThemeFixture(page);
			const host = page.locator("[data-my-calendar]");
			await host.locator(".lfc-calendar-title-button").click();
			const year = host.getByLabel("Year", { exact: true });
			await year.fill("2027");
			for (const scheme of ["dark", "light", "dark"]) {
				await page.emulateMedia({ colorScheme: scheme });
				await expectPalette(host, scheme);
				const forced = scheme === "dark" ? "light" : "dark";
				await host.evaluate((element, value) => element.classList.add(`my-${value}`), forced);
				await expectPalette(host, forced);
				await host.evaluate((element, value) => element.classList.remove(`my-${value}`), forced);
				await expectPalette(host, scheme);
				await expect(year).toBeFocused();
				await expect(year).toHaveValue("2027");
			}
			expect(await page.evaluate(() => window.__lfcTheme.observations.requests)).toBe(1);
		});

		test("inherited ancestor themes preserve picker fields and application token overrides", async ({ page }) => {
			await mountThemeFixture(page);
			const host = page.locator("[data-my-calendar]");
			await host.evaluate((element) => element.classList.add("my-inherit"));
			await host.locator(".lfc-calendar-title-button").click();
			const year = host.getByLabel("Year", { exact: true });
			await year.fill("2027");
			for (const scheme of ["dark", "light", "dark"]) {
				await page.locator("body").evaluate((element, value) => { element.dataset.myTheme = value; }, scheme);
				await expectPalette(host, scheme);
				await expect(year).toBeFocused();
				await expect(year).toHaveValue("2027");
			}
			await page.addStyleTag({ content: "@layer my.application { [data-my-calendar] { --lfc-background: #ffffff; } }" });
			await expect(host).toHaveCSS("background-color", "rgb(255, 255, 255)");
			await expect(year).toBeFocused();
			expect(await page.evaluate(() => window.__lfcTheme.observations.requests)).toBe(1);
		});

		test("detached mounting and reparenting pick up the current inherited theme", async ({ page }) => {
			await mountThemeFixture(page, true);
			await page.evaluate(() => {
				const { host } = window.__lfcTheme;
				host.classList.add("my-inherit");
				document.body.dataset.myTheme = "dark";
				document.querySelector("main").append(host);
			});
			const host = page.locator("[data-my-calendar]");
			await expectPalette(host, "dark");
			await page.evaluate(() => {
				const parent = document.createElement("section");
				parent.className = "my-light";
				document.body.append(parent);
				parent.append(window.__lfcTheme.host);
			});
			await expectPalette(host, "light");
			await page.evaluate(() => window.__lfcTheme.calendar.destroy());
			await expect(host).not.toHaveClass(/lfc-palette/u);
		});

		test("example palettes support explicit and automatic themes", async ({ page }) => {
			await mountThemeFixture(page);
			await page.addStyleTag({ url: "/examples/example.css" });
			await page.addStyleTag({ url: "/examples/advanced/theme.css" });
			const host = page.locator("[data-my-calendar]");
			await host.evaluate((element) => element.classList.add("my-calendar"));
			for (const system of ["dark", "light"]) {
				await page.emulateMedia({ colorScheme: system });
				for (const theme of ["dark", "light", "auto"]) {
					await page.locator("html").evaluate((element, value) => { element.dataset.myTheme = value; }, theme);
					const effective = theme === "auto" ? system : theme;
					await expectPalette(host, effective);
					await expect(page.locator("body")).toHaveCSS("background-color",
						effective === "dark" ? "rgb(3, 16, 23)" : "rgb(237, 245, 245)");
					const appointmentColor = await page.locator("html").evaluate((element) => {
						const probe = document.createElement("span");
						probe.style.color = "var(--my-appointment-color)";
						element.append(probe);
						const color = getComputedStyle(probe).color;
						probe.remove();
						return color;
					});
					expect(appointmentColor).toBe(effective === "dark" ? "rgb(77, 224, 181)" : "rgb(0, 118, 108)");
				}
			}
		});

		test("increased contrast retains semantic foreground and border roles", async ({ page }) => {
			await page.emulateMedia({ colorScheme: "dark", contrast: "more" });
			await mountThemeFixture(page);
			test.skip(!await page.evaluate(() => matchMedia("(prefers-contrast: more)").matches),
				"This browser build cannot emulate increased contrast.");
			const host = page.locator("[data-my-calendar]");
			const color = await host.evaluate((element) => getComputedStyle(element).color);
			await expect(host).toHaveCSS("border-top-color", color);
			await expect(host.locator(".lfc-calendar-agenda-event .lfc-calendar-time")).toHaveCSS("color", color);
		});
	});
}
