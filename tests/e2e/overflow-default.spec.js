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

for (const navigation of ["gotoDate", "today"]) {
	test(`early same-date ${navigation} preserves the complete usable grid`, async ({ page }) => {
		await expectLibraryFixtureReady(page);
		expect(await page.evaluate(async (navigation) => {
			const { createCalendar } = await import("/dist/index.js");
			const host = document.querySelector("[data-my-calendar]");
			let armed = true;
			let mounts = 0;
			const calendar = createCalendar(host, {
				events: [], initialDate: "2026-07-14", now: () => new Date("2026-07-14T12:00:00Z"),
				renderHooks: [{
					id: "same-date",
					renderDayBadge: () => {
						if (!armed) { return; }
						armed = false;
						if (navigation === "gotoDate") { calendar.gotoDate("2026-07-14"); }
						else { calendar.today(); }
					},
					dayDidMount: () => { mounts += 1; }
				}]
			});
			window.ownershipCalendar = calendar;
			calendar.render();
			return { armed, mounts, phase: calendar.getState().phase };
		}, navigation)).toEqual({ armed: false, mounts: 42, phase: "ready" });
		await expect(page.getByRole("gridcell")).toHaveCount(42);
		await expect(page.locator(".lfc-calendar-day-button")).toHaveCount(42);
		await page.locator('.lfc-calendar-day-button[data-lfc-date="2026-07-15"]').click();
		expect(await page.evaluate(() => window.ownershipCalendar.getState().selectedDate.day)).toBe(15);
		await expect(page.locator('[aria-selected="true"] .lfc-calendar-day-button')).toHaveAttribute("data-lfc-date", "2026-07-15");
	});
}

for (const navigation of ["gotoDate", "focusDate"]) {
	test(`detached ${navigation} keeps DOM and state aligned before insertion`, async ({ page }) => {
		await expectLibraryFixtureReady(page);
		expect(await page.evaluate(async (navigation) => {
			const { createCalendar } = await import("/dist/index.js");
			const host = document.querySelector("[data-my-calendar]");
			host.remove();
			const states = [];
			window.detachedCompletions = 0;
			const calendar = createCalendar(host, {
				initialDate: "2026-07-14", gridEventDisplay: { compact: "count", wide: "count" },
				events: [{ id: "one", start: "2026-07-15", title: "One" }],
				onStateChange: (state) => { states.push(state.selectedDate.day); },
				onEventOverflowDefault: () => { window.detachedCompletions += 1; }
			});
			calendar.render();
			states.length = 0;
			calendar[navigation]("2026-07-15");
			host.querySelector('.lfc-calendar-grid-more[data-lfc-date="2026-07-15"]').click();
			const result = {
				states, day: calendar.getState().selectedDate.day, connected: host.isConnected,
				cells: host.querySelectorAll('[role="gridcell"]').length,
				selected: host.querySelector('[aria-selected="true"] .lfc-calendar-day-button').getAttribute("data-lfc-date"),
				completions: window.detachedCompletions
			};
			document.querySelector("main").append(host);
			return result;
		}, navigation)).toEqual({
			states: [15], day: 15, connected: false, cells: 42, selected: "2026-07-15", completions: 0
		});
		await page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-07-15"]').click();
		expect(await page.evaluate(() => window.detachedCompletions)).toBe(1);
		await expect(page.locator(".lfc-calendar-agenda-title")).toBeFocused();
	});
}

for (const navigation of ["focusDate", "focusToday"]) {
	for (const boundary of ["badge", "cleanup", "mount", "day-focus", "restore-focus"]) {
		test(`same-target ${navigation} at ${boundary} publishes the winning selection once`, async ({ page }) => {
			await expectLibraryFixtureReady(page);
			await page.evaluate(async ({ navigation, boundary }) => {
				const { createCalendar } = await import("/dist/index.js");
				const host = document.querySelector("[data-my-calendar]");
				const outside = document.createElement("button");
				outside.textContent = "Application focus";
				document.body.prepend(outside);
				const fixture = { armed: false, states: [], completions: 0 };
				const supersede = () => {
					if (!fixture.armed) { return; }
					fixture.armed = false;
					if (navigation === "focusDate") { calendar.focusDate("2026-07-15"); }
					else { calendar.focusToday(); }
					outside.focus();
				};
				const calendar = createCalendar(host, {
					initialDate: "2026-07-14", now: () => new Date("2026-07-15T12:00:00Z"),
					gridEventDisplay: { compact: "count", wide: "count" },
					events: [0, 1, 2, 3].map((id) => ({ id: String(id), start: "2026-07-15", title: "An occurrence" })),
					onStateChange: (state) => { fixture.states.push(state.selectedDate.day); },
					onEventOverflowDefault: () => { fixture.completions += 1; },
					renderHooks: [{
						id: "same-target",
						renderDayBadge: () => { if (boundary === "badge") { supersede(); } },
						dayDidMount: () => {
							if (boundary === "mount") { supersede(); }
							return () => { if (boundary === "cleanup") { supersede(); } };
						}
					}]
				});
				calendar.render();
				fixture.states.length = 0;
				host.addEventListener("focusin", ({ target }) => {
					if ((boundary === "day-focus" && target.classList.contains("lfc-calendar-day-button")) ||
						(boundary === "restore-focus" && target.classList.contains("lfc-calendar-grid-more"))) { supersede(); }
				});
				window.sameTargetFixture = fixture;
				window.ownershipCalendar = calendar;
			}, { navigation, boundary });
			const overflow = page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-07-15"]');
			await overflow.focus();
			await page.evaluate(() => { window.sameTargetFixture.armed = true; });
			await overflow.press("Enter");
			expect(await page.evaluate(() => ({
				...window.sameTargetFixture, selected: window.ownershipCalendar.getState().selectedDate.day
			}))).toEqual({ armed: false, states: [15], completions: 0, selected: 15 });
			await expect(page.getByRole("gridcell")).toHaveCount(42);
			await expect(page.locator(".lfc-calendar-day-button")).toHaveCount(42);
			await expect(page.locator('[aria-selected="true"] .lfc-calendar-day-button')).toHaveAttribute("data-lfc-date", "2026-07-15");
			await expect(page.getByRole("button", { name: "Application focus" })).toBeFocused();
		});
	}
}

for (const boundary of ["provider", "abort"]) {
	for (const navigation of ["focusDate", "focusToday"]) {
		for (const timing of ["array", "promise"]) {
			test(`${navigation} at ${boundary} preserves ${timing} source phases and range`, async ({ page }) => {
				await expectLibraryFixtureReady(page);
				await page.evaluate(async ({ boundary, navigation, timing }) => {
					const { createCalendar } = await import("/dist/index.js");
					const fixture = { states: [], ranges: [], duringSource: [], completions: 0, requests: 0 };
					const events = [0, 1].map((id) => ({ id: String(id), start: "2026-08-01", title: "An occurrence" }));
					const reenter = () => {
						if (navigation === "focusDate") { calendar.focusDate("2026-08-01"); }
						else { calendar.focusToday(); }
						fixture.duringSource = [...fixture.states];
					};
					const calendar = createCalendar(document.querySelector("[data-my-calendar]"), {
						initialDate: "2026-07-14", now: () => new Date("2026-08-01T12:00:00Z"),
						gridEventDisplay: { compact: "count", wide: "count" },
						events: ({ signal }) => {
							fixture.requests += 1;
							if (fixture.requests === 1) { return events; }
							if (boundary === "abort" && fixture.requests === 2) {
								signal.addEventListener("abort", reenter, { once: true });
								return new Promise(() => {});
							}
							if (boundary === "provider") { reenter(); }
							return timing === "array" ? events : Promise.resolve(events);
						},
						onStateChange: (state) => {
							fixture.states.push(`${state.phase}:${state.selectedDate.month}-${state.selectedDate.day}`);
							fixture.ranges.push(state.range);
						},
						onEventOverflowDefault: () => { fixture.completions += 1; }
					});
					calendar.render();
					if (boundary === "abort") { calendar.refetchEvents(); }
					fixture.states.length = 0;
					fixture.ranges.length = 0;
					window.sourceFocusFixture = fixture;
					window.ownershipCalendar = calendar;
				}, { boundary, navigation, timing });
				await page.locator('.lfc-calendar-grid-more[data-lfc-date="2026-08-01"]').click();
				await expect.poll(() => page.evaluate(() => window.ownershipCalendar.getState().phase)).toBe("ready");
				const range = { start: "2026-07-26", end: "2026-09-06" };
				expect(await page.evaluate(() => window.sourceFocusFixture)).toEqual({
					states: timing === "array" ? ["ready:8-1"] : ["loading:8-1", "ready:8-1"],
					ranges: timing === "array" ? [range] : [range, range],
					duringSource: [], completions: 0, requests: boundary === "abort" ? 3 : 2
				});
				expect(await page.evaluate(() => window.ownershipCalendar.getState().selectedDate)).toEqual({ year: 2026, month: 8, day: 1 });
				await expect(page.getByRole("gridcell")).toHaveCount(42);
				await expect(page.locator('[aria-selected="true"] .lfc-calendar-day-button')).toHaveAttribute("data-lfc-date", "2026-08-01");
				await expect(page.locator("[data-my-calendar]")).not.toHaveAttribute("aria-busy", "true");
			});
		}
	}
}
