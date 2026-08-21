const ADVANCED_ROUTE = "/examples/advanced/";
const HELD_PULL_END_RATIO = 0.48;
const HELD_PULL_INTERMEDIATE_RATIOS = Object.freeze([0.7, 0.58]);
const HELD_PULL_MINIMUM_OFFSET = 24;
const HELD_PULL_START_RATIO = 0.8;
const SWIPE_VIEWPORT_SELECTOR = ".lfc-calendar-swipe-viewport";

async function waitForReady(page, route) {
	const response = await page.goto(route, { waitUntil: "domcontentloaded" });
	if (response === null || !response.ok()) {
		throw new Error(`Screenshot route failed to load: ${route}`);
	}
	await page.locator('html[data-example-ready="true"]').waitFor({ state: "attached" });
	await page.locator("[data-example-calendar]").waitFor({ state: "visible" });
	await page.locator("[data-example-calendar]").evaluate((element) => {
		if (element.getAttribute("aria-busy") === "true") {
			throw new Error("The screenshot calendar is still busy.");
		}
	});
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

async function scrollCalendarIntoView(page) {
	await page.locator("[data-example-calendar]").evaluate((element) => {
		const top = element.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ behavior: "instant", left: 0, top });
	});
}

async function setDarkTheme(page) {
	await page.locator("[data-example-theme-control]").selectOption("dark");
	await page.locator('html[data-example-theme="dark"]').waitFor({ state: "attached" });
}

async function openMonthPicker(page) {
	await page.getByRole("button", { name: /^Choose schedule month and year/u }).click();
	await page.getByRole("dialog", { name: /month and year/u }).waitFor({ state: "visible" });
}

function agendaAction(page, eventId) {
	const fixture = `[data-example-event-surface="agenda"][data-example-event-id="${eventId}"]`;
	return page.locator(`:is(a, button)${fixture}, ${fixture} :is(a, button)`).first();
}

async function openAgendaDialog(page) {
	await agendaAction(page, "appointment:41").click();
	await page.locator("[data-example-event-dialog]").waitFor({ state: "visible" });
}

async function enterGridActionMode(page) {
	const selectedDay = page.locator('[role="gridcell"][aria-selected="true"] > button');
	await selectedDay.focus();
	await selectedDay.press("F2");
	const action = page.locator(
		':is(a, button)[data-example-event-surface="grid-summary"]:focus, ' +
		'[data-example-event-surface="grid-summary"] :is(a, button):focus'
	);
	await action.waitFor({ state: "visible" });
	await action.scrollIntoViewIfNeeded();
}

async function holdTouchSwipeLeft(page) {
	const viewport = page.locator(SWIPE_VIEWPORT_SELECTOR);
	await viewport.waitFor({ state: "visible" });
	const bounds = await viewport.boundingBox();
	if (bounds === null || bounds.width <= 0 || bounds.height <= 0) {
		throw new Error("The screenshot swipe viewport has no visible bounds.");
	}

	const initialScrollLeft = await viewport.evaluate((element) => element.scrollLeft);
	const startX = Math.round(bounds.x + bounds.width * HELD_PULL_START_RATIO);
	const y = Math.round(bounds.y + bounds.height / 2);
	const session = await page.context().newCDPSession(page);
	const touchPoint = (x) => ({
		force: 1,
		id: 1,
		radiusX: 1,
		radiusY: 1,
		x,
		y
	});

	await session.send("Input.dispatchTouchEvent", {
		touchPoints: [touchPoint(startX)],
		type: "touchStart"
	});
	for (const ratio of [...HELD_PULL_INTERMEDIATE_RATIOS, HELD_PULL_END_RATIO]) {
		await session.send("Input.dispatchTouchEvent", {
			touchPoints: [touchPoint(Math.round(bounds.x + bounds.width * ratio))],
			type: "touchMove"
		});
		await page.evaluate(() => new Promise((resolvePromise) => {
			requestAnimationFrame(resolvePromise);
		}));
	}

	await page.waitForFunction(
		({ initial, minimumOffset, selector }) => {
			const element = document.querySelector(selector);
			return element instanceof HTMLElement &&
				element.scrollLeft - initial >= minimumOffset &&
				element.scrollLeft - initial < element.clientWidth;
		},
		{
			initial: initialScrollLeft,
			minimumOffset: Math.min(HELD_PULL_MINIMUM_OFFSET, bounds.width * 0.08),
			selector: SWIPE_VIEWPORT_SELECTOR
		}
	);
}

export async function prepareScreenshotScene(page, scene) {
	if (scene.route !== ADVANCED_ROUTE) {
		throw new Error(`${scene.id}: screenshot scene must use the deterministic advanced fixture.`);
	}
	await waitForReady(page, scene.route);

	switch (scene.id) {
		case "desktop-month-grid":
			await scrollCalendarIntoView(page);
			break;
		case "month-year-jump":
			await scrollCalendarIntoView(page);
			await openMonthPicker(page);
			break;
		case "mobile-month-agenda-dark":
			await setDarkTheme(page);
			await scrollCalendarIntoView(page);
			break;
		case "mobile-month-swipe-pull":
			await scrollCalendarIntoView(page);
			await holdTouchSwipeLeft(page);
			break;
		case "event-details-dark":
			await setDarkTheme(page);
			await openAgendaDialog(page);
			break;
		case "grid-event-keyboard-focus":
			await scrollCalendarIntoView(page);
			await enterGridActionMode(page);
			break;
		default:
			throw new Error(`Unknown screenshot scene: ${scene.id}`);
	}

	await page.evaluate(() => new Promise((resolvePromise) => {
		requestAnimationFrame(() => requestAnimationFrame(resolvePromise));
	}));
}
