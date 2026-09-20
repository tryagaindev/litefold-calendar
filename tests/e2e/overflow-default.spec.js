import { expect, test } from "@playwright/test";
import { expectLibraryFixtureReady } from "./helpers.js";

async function mount(page, behavior = "observe") {
	await expectLibraryFixtureReady(page);
	await page.evaluate(async (behavior) => {
		const { createCalendar } = await import("/dist/index.js");
		const host = document.querySelector("[data-my-calendar]");
		const outside = document.createElement("button");
		outside.textContent = "Application focus";
		document.body.prepend(outside);
		const fixture = { calls: [], order: [], scrolls: [], errors: [] };
		const scrollIntoView = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = function (options) {
			fixture.scrolls.push({ focused: document.activeElement === this, options });
		};
		fixture.restore = () => { Element.prototype.scrollIntoView = scrollIntoView; };
		host.addEventListener("focusin", (event) => {
			if (event.target.classList.contains("lfc-calendar-agenda-title")) {
				if (behavior === "redirect") { outside.focus({ preventScroll: true }); }
				if (behavior === "detach") { host.remove(); }
			}
		});
		const calendar = createCalendar(host, {
			initialDate: "2026-07-13", gridEventDisplay: { compact: "count", wide: "count" },
			events: [{ id: "one", start: "2026-07-14", title: "One" }],
			onError: (error) => { fixture.errors.push(error.code); },
			onEventOverflowActivate: (context) => {
				fixture.pre = context;
				fixture.order.push("pre");
				queueMicrotask(() => { fixture.order.push("microtask"); });
				if (behavior === "cancel") { context.nativeEvent.preventDefault(); outside.focus(); }
				if (behavior === "inert") { host.inert = true; }
			},
			onEventOverflowDefault: (context) => {
				fixture.order.push("post");
				fixture.calls.push({
					focused: document.activeElement === context.agendaHeading,
					trusted: context.nativeEvent.isTrusted,
					same: context.nativeEvent === fixture.pre.nativeEvent && context.events === fixture.pre.events &&
						context.date === fixture.pre.date && context.triggerElement === fixture.pre.element,
					date: context.dateString
				});
				if (behavior === "scroll") {
					context.agendaHeading.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
				}
				if (behavior === "post-focus") { outside.focus(); }
			}
		});
		fixture.calendar = calendar;
		window.overflowFixture = fixture;
		calendar.render();
	}, behavior);
}

for (const activation of ["pointer", "Enter", "Space"]) {
	test(`native ${activation} reports exactly one synchronous focused completion`, async ({ page }) => {
		await mount(page);
		const button = page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-07-14"]');
		if (activation === "pointer") { await button.click(); }
		else { await button.focus(); await button.press(activation); }
		expect(await page.evaluate(() => ({
			calls: window.overflowFixture.calls, order: window.overflowFixture.order,
			scrolls: window.overflowFixture.scrolls, errors: window.overflowFixture.errors
		}))).toEqual({
			calls: [{ focused: true, trusted: true, same: true, date: "2026-07-14" }],
			order: ["pre", "post", "microtask"], scrolls: [], errors: []
		});
	});
}

for (const behavior of ["redirect", "detach", "inert", "cancel", "post-focus", "scroll"]) {
	test(`real focus ownership: ${behavior}`, async ({ page }) => {
		await mount(page, behavior);
		await page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-07-14"]').click();
		const result = await page.evaluate(() => ({
			calls: window.overflowFixture.calls.length, scrolls: window.overflowFixture.scrolls,
			focus: document.activeElement.textContent
		}));
		expect(result.calls).toBe(["post-focus", "scroll"].includes(behavior) ? 1 : 0);
		if (["redirect", "cancel", "post-focus"].includes(behavior)) {
			expect(result.focus).toBe("Application focus");
		}
		expect(result.scrolls).toEqual(behavior === "scroll" ? [{
			focused: true, options: { behavior: "instant", block: "start", inline: "nearest" }
		}] : []);
	});
}

test("completion validates focus in the heading's iframe document", async ({ page }) => {
	await expectLibraryFixtureReady(page);
	await page.evaluate(async () => {
		const { createCalendar } = await import("/dist/index.js");
		const frame = document.createElement("iframe");
		document.body.append(frame);
		const frameDocument = frame.contentDocument;
		const host = frameDocument.createElement("div");
		frameDocument.body.append(host);
		window.frameCompletions = [];
		const calendar = createCalendar(host, {
			initialDate: "2026-07-14", gridEventDisplay: { compact: "count", wide: "count" },
			events: [{ id: "frame", start: "2026-07-14", title: "Frame event" }],
			onEventOverflowDefault: ({ agendaHeading }) => {
				window.frameCompletions.push(agendaHeading.ownerDocument === frameDocument &&
					frameDocument.activeElement === agendaHeading && document.activeElement === frame);
			}
		});
		calendar.render();
	});
	await page.frameLocator("iframe").locator('.lfc-calendar-grid-more[data-lfc-date="2026-07-14"]').click();
	expect(await page.evaluate(() => window.frameCompletions)).toEqual([true]);
});
