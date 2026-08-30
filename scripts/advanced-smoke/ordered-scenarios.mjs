import assert from "node:assert/strict";

import {
	clickCommand,
	findAgendaAction,
	findAgendaMoreButton,
	getAgendaActions,
	requireAgendaAction,
	requireElement,
	requireSelectedDay,
	waitFor
} from "./helpers.mjs";

const APPOINTMENT_ID = "appointment:41";
const APPOINTMENT_TITLE = "Design review";
const POINT_APPOINTMENT_ID = "appointment:44";
const TASK_ID = "task:8";

function readCompletedGridRenderCount(element) {
	const count = Number.parseInt(element.textContent ?? "", 10);
	assert.ok(Number.isSafeInteger(count) && count >= 0, "Expected a non-negative grid-render count.");
	return count;
}

export async function runAdvancedSmokeScenarios(environment) {
	const {
		document,
		dom,
		isPopoverOpen,
		observedErrors,
		uncaughtErrors
	} = environment;
	const eventDialog = requireElement(
		document,
		"[data-my-event-dialog]",
		dom.window.HTMLDialogElement
	);

	const host = requireElement(document, "[data-my-calendar]", dom.window.HTMLElement);
	const fallbackElement = requireElement(
		document,
		"[data-my-fallback]",
		dom.window.HTMLElement
	);
	const boundsNote = requireElement(document, "[data-my-bounds-note]", dom.window.HTMLElement);
	const actionResult = requireElement(
		document,
		"[data-my-action-result]",
		dom.window.HTMLElement
	);
	const phase = requireElement(document, "[data-my-state-phase]", dom.window.HTMLElement);
	const phaseHistory = requireElement(
		document,
		"[data-my-state-phase-history]",
		dom.window.HTMLElement
	);
	const busyState = requireElement(
		document,
		"[data-my-state-busy]",
		dom.window.HTMLElement
	);
	const gridRenders = requireElement(
		document,
		"[data-my-state-grid-renders]",
		dom.window.HTMLElement
	);
	const sourceTiming = requireElement(
		document,
		"[data-my-source-timing]",
		dom.window.HTMLSelectElement
	);
	const completePending = requireElement(
		document,
		"[data-my-complete-pending]",
		dom.window.HTMLButtonElement
	);
	const displayedMonth = requireElement(
		document,
		"[data-my-state-month]",
		dom.window.HTMLElement
	);
	const selectedDate = requireElement(
		document,
		"[data-my-state-selected]",
		dom.window.HTMLElement
	);
	const assertiveAnnouncer = requireElement(
		document,
		"[data-my-announcer-assertive]",
		dom.window.HTMLElement
	);
	const agenda = requireElement(host, "section[aria-labelledby]", dom.window.HTMLElement);

	await waitFor(
		() => findAgendaAction(host, APPOINTMENT_ID) !== null &&
			host.getAttribute("aria-busy") !== "true" &&
			phase.textContent === "ready",
		"the advanced example to render its ready agenda"
	);
	assert.equal(sourceTiming.value, "immediate", "Immediate arrays must be the default source timing.");
	assert.equal(completePending.disabled, true, "An immediate source must not expose pending work.");
	assert.notEqual(host.getAttribute("aria-busy"), "true", "An immediate source must not mark the host busy.");
	assert.equal(busyState.textContent, "false", "The host-busy observation must match the root state.");
	assert.equal(
		phaseHistory.textContent,
		"ready",
		"The initial immediate source must commit directly without a loading phase."
	);
	assert.equal(
		readCompletedGridRenderCount(gridRenders),
		1,
		"The initial immediate source must complete one 42-day grid render."
	);

	assert.equal(host.classList.contains("litefold-calendar"), true, "Expected the public root class.");
	assert.match(
		boundsNote.textContent ?? "",
		/July 15, 2026 through September 15, 2027.*underlined month and year/u,
		"The showcase must make its bounds and native month/year trigger discoverable."
	);
	assert.equal(host.getAttribute("data-litefold-calendar"), "", "Expected the presence-only root marker.");
	assert.equal(fallbackElement.hidden, true, "A committed usable snapshot must hide the fallback.");
	assert.equal(
		host.classList.contains(["lfc", "calendar"].join("-")),
		false,
		"The legacy root class must be absent."
	);
	assert.equal(
		host.hasAttribute(["data", "lfc", "calendar"].join("-")),
		false,
		"The legacy root marker must be absent."
	);
	assert.ok(
		host.querySelector("[data-my-toolbar-end]") !== null,
		"Expected the host-owned toolbar filter slot to mount."
	);
	assert.equal(host.querySelector("h3")?.tagName, "H3", "Expected headingLevel 3.");
	assert.equal(
		host.querySelector(".lfc-calendar-today-button")?.textContent,
		"Today",
		"Expected the conventional Today label in the advanced fixture."
	);
	assert.equal(
		host.querySelector('[role="columnheader"]')?.getAttribute("aria-label"),
		"Monday",
		"Expected the explicit Monday week start."
	);
	assert.deepEqual(
		[...host.querySelectorAll(".my-navigation-icon")].map((node) => node.textContent),
		["\u2190", "\u2192"],
		"Expected both custom navigation icon factories."
	);
	assert.equal(
		[...host.querySelectorAll(".my-navigation-icon")].every((node) => node.getAttribute("dir") === "ltr"),
		true,
		"Expected custom icons to have a deterministic base direction before RTL mirroring."
	);

	assert.equal(displayedMonth.textContent, "2026-08-01");
	assert.equal(selectedDate.textContent, "2026-08-06");
	assert.equal(document.querySelector("[data-my-state-issues]")?.textContent, "0");
	assert.equal(
		document.querySelector("[data-my-state-range]")?.textContent,
		"2026-07-27 to 2026-09-07 (exclusive)"
	);
	const title = requireElement(host, ".lfc-calendar-title", dom.window.HTMLElement);
	const titleButton = requireElement(
		title,
		".lfc-calendar-title-button",
		dom.window.HTMLButtonElement
	);
	assert.equal(titleButton.textContent, "August 2026");
	assert.equal(
		titleButton.getAttribute("aria-label"),
		"Choose schedule month and year, currently August 2026"
	);
	assert.equal(titleButton.getAttribute("aria-haspopup"), "dialog");
	assert.equal(titleButton.getAttribute("aria-expanded"), "false");
	const monthPickerId = titleButton.getAttribute("popovertarget");
	assert.notEqual(monthPickerId, null, "Expected the title button to invoke the month/year popover.");
	assert.equal(titleButton.getAttribute("aria-controls"), monthPickerId);
	const monthPicker = requireElement(
		host,
		`#${monthPickerId}`,
		dom.window.HTMLElement
	);
	assert.equal(monthPicker.getAttribute("popover"), "auto");
	assert.equal(monthPicker.getAttribute("role"), "dialog");
	const monthPickerTitleId = monthPicker.getAttribute("aria-labelledby");
	assert.notEqual(monthPickerTitleId, null, "Expected the month/year popover to have a heading.");
	assert.equal(document.getElementById(monthPickerTitleId)?.textContent, "Jump to schedule month and year");
	const monthPickerMonth = requireElement(
		monthPicker,
		'select[name="month"]',
		dom.window.HTMLSelectElement
	);
	const monthPickerYear = requireElement(
		monthPicker,
		'input[name="year"][type="number"]',
		dom.window.HTMLInputElement
	);
	assert.equal(monthPickerMonth.labels?.[0]?.textContent?.startsWith("Month"), true);
	assert.equal(monthPickerYear.labels?.[0]?.textContent?.startsWith("Year"), true);
	assert.equal(monthPickerYear.min, "2026");
	assert.equal(monthPickerYear.max, "2027");
	assert.deepEqual(
		[...monthPickerMonth.options].map((option) => option.textContent),
		[
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"
		]
	);
	const jumpButton = requireElement(
		monthPicker,
		'.lfc-calendar-month-picker-jump[type="submit"]',
		dom.window.HTMLButtonElement
	);
	const cancelButton = requireElement(
		monthPicker,
		'.lfc-calendar-month-picker-cancel[type="button"]',
		dom.window.HTMLButtonElement
	);
	assert.equal(jumpButton.textContent, "Show month");
	assert.equal(cancelButton.textContent, "Cancel");

	titleButton.focus();
	titleButton.click();
	assert.equal(isPopoverOpen(monthPicker), true, "Expected title activation to open the popover.");
	assert.equal(titleButton.getAttribute("aria-expanded"), "true");
	assert.equal(document.activeElement, monthPickerMonth, "Expected initial popover focus on Month.");
	assert.equal(monthPickerMonth.value, "8");
	assert.equal(monthPickerYear.value, "2026");
	assert.equal(monthPickerMonth.options[5]?.disabled, true, "June must be below minDate.");
	assert.equal(monthPickerMonth.options[6]?.disabled, false, "July must intersect minDate.");
	assert.equal(monthPickerMonth.options[8]?.disabled, false, "September 2026 must be in range.");
	assert.equal(monthPickerMonth.options[9]?.disabled, false, "October 2026 must be in range.");
	monthPickerYear.value = "2027";
	monthPickerYear.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	assert.equal(monthPickerMonth.options[8]?.disabled, false, "September must intersect maxDate.");
	assert.equal(monthPickerMonth.options[9]?.disabled, true, "October must be above maxDate.");
	monthPickerMonth.value = "9";
	cancelButton.click();
	assert.equal(isPopoverOpen(monthPicker), false, "Cancel must close the popover.");
	assert.equal(titleButton.getAttribute("aria-expanded"), "false");
	assert.equal(document.activeElement, titleButton, "Cancel must restore title-trigger focus.");
	assert.equal(displayedMonth.textContent, "2026-08-01", "Cancel must not navigate.");

	titleButton.click();
	monthPickerYear.focus();
	monthPicker.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "Escape"
	}));
	assert.equal(isPopoverOpen(monthPicker), false, "Escape must dismiss the popover.");
	assert.equal(titleButton.getAttribute("aria-expanded"), "false");
	assert.equal(document.activeElement, titleButton, "Escape must restore title-trigger focus.");

	const nextNavigationButton = requireElement(
		host,
		".lfc-calendar-nav-button-next",
		dom.window.HTMLButtonElement
	);
	titleButton.click();
	nextNavigationButton.focus();
	monthPicker.hidePopover();
	assert.equal(
		document.activeElement,
		nextNavigationButton,
		"Pointer-style light-dismiss must preserve the newly focused outside control."
	);

	titleButton.click();
	monthPickerYear.value = "2027";
	monthPickerYear.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	monthPickerMonth.value = "9";
	jumpButton.click();
	await waitFor(
		() => displayedMonth.textContent === "2027-09-01" && phase.textContent === "ready",
		"the native month/year Jump action"
	);
	assert.equal(isPopoverOpen(monthPicker), false, "Jump must close the popover.");
	assert.equal(document.activeElement, titleButton, "Jump must restore title-trigger focus.");
	assert.equal(selectedDate.textContent, "2027-09-06");
	assert.equal(
		document.querySelector("[data-my-state-range]")?.textContent,
		"2027-08-30 to 2027-10-11 (exclusive)",
		"Configured bounds must not clip the fixed 42-day provider range."
	);
	assert.equal(
		host.getAttribute("data-test-source-range"),
		"2027-08-30 to 2027-10-11 (exclusive)",
		"The event source itself must receive the complete 42-day range."
	);
	assert.equal(
		host.querySelector(".lfc-calendar-nav-button-next")?.getAttribute("aria-disabled"),
		"true",
		"Next must expose its guarded boundary state in the final allowed month."
	);
	const disabledDay = requireElement(
		host,
		'button[data-lfc-date="2027-09-16"]',
		dom.window.HTMLButtonElement
	);
	const maximumDay = requireElement(
		host,
		'button[data-lfc-date="2027-09-15"]',
		dom.window.HTMLButtonElement
	);
	assert.equal(maximumDay.disabled, false, "The inclusive maxDate must remain selectable.");
	assert.equal(disabledDay.disabled, true, "The day after maxDate must be disabled.");
	assert.equal(
		disabledDay.closest('[role="gridcell"]')?.hasAttribute("data-test-day-badge-rendered"),
		true,
		"Day extensions must still inspect an out-of-range structural cell."
	);
	assert.equal(
		disabledDay.querySelector('[data-test-event-surface="grid-summary"]'),
		null,
		"An out-of-range provider event must not render a grid summary."
	);
	titleButton.click();
	monthPickerYear.value = "2026";
	monthPickerYear.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	monthPickerMonth.value = "8";
	jumpButton.click();
	await waitFor(
		() => displayedMonth.textContent === "2026-08-01" && phase.textContent === "ready",
		"returning from the picker scenario"
	);
	const actionBeforeSameMonthJump = actionResult.textContent;
	titleButton.click();
	jumpButton.click();
	assert.equal(isPopoverOpen(monthPicker), false, "A same-month Jump must close the popover.");
	assert.equal(displayedMonth.textContent, "2026-08-01", "A same-month Jump must not navigate.");
	assert.equal(selectedDate.textContent, "2026-08-06", "A same-month Jump must not reselect.");
	assert.equal(
		actionResult.textContent,
		actionBeforeSameMonthJump,
		"A month Jump must not invoke onDaySelect."
	);
	const agendaTitleId = agenda.getAttribute("aria-labelledby");
	assert.notEqual(agendaTitleId, null, "Expected the agenda to name itself with a heading.");
	assert.match(
		document.getElementById(agendaTitleId)?.textContent ?? "",
		/^Schedule for /u,
		"Expected the localized agenda title template."
	);

	const { button: selectedDay, cell: selectedCell } = requireSelectedDay(host);
	assert.ok(
		selectedDay.querySelector("time[datetime=\"2026-08-06\"]") instanceof dom.window.HTMLTimeElement,
		"Expected the day number to use a native time element."
	);
	assert.equal(
		selectedDay.querySelector('[data-test-event-surface="grid-summary"]'),
		null,
		"Grid actions must be siblings of the full-cell day button."
	);
	const selectedGridActions = [...selectedCell.querySelectorAll(
		'[data-test-event-surface="grid-summary"], .lfc-calendar-grid-more'
	)];
	assert.ok(selectedGridActions.length > 0, "Expected visible grid actions for the selected day.");
	assert.equal(
		selectedGridActions.every((action) => action.getAttribute("tabindex") === "-1"),
		true,
		"Grid actions must remain outside the page tab sequence."
	);
	assert.match(selectedDay.getAttribute("aria-label") ?? "", /53 items/u);
	assert.equal(
		selectedCell.classList.contains("my-today-hook"),
		true,
		"Expected dayDidMount to decorate the configured current date."
	);
	assert.equal(
		selectedCell.classList.contains("my-current-month-hook") &&
			selectedCell.classList.contains("my-selected-hook"),
		true,
		"Expected dayDidMount to expose current-month and selection state."
	);
	assert.ok(
		host.querySelector('[role="gridcell"].my-outside-month-hook') !== null,
		"Expected dayDidMount to expose adjacent-month state."
	);
	assert.equal(
		host.querySelectorAll('[role="gridcell"][data-test-day-badge-rendered]').length,
		42,
		"Expected renderDayBadge to run for every fixed-grid day before returning no output."
	);
	assert.equal(
		host.querySelector(".lfc-calendar-day-badge:not(:empty)"),
		null,
		"Expected renderDayBadge to leave every visual badge slot empty."
	);
	assert.equal(
		selectedCell.querySelectorAll('[data-test-event-surface="grid-summary"]').length,
		2,
		"Expected maxGridEventsPerDay to cap visual summaries."
	);
	const compactOverflow = requireElement(
		selectedCell,
		":scope .lfc-calendar-event-overflow-cluster " +
			"> .lfc-calendar-event-overflow.lfc-is-compact",
		dom.window.HTMLSpanElement
	);
	assert.equal(
		compactOverflow.getAttribute("aria-hidden"),
		"true",
		"The compact event-overflow number must remain outside the accessibility tree."
	);
	assert.equal(
		compactOverflow.classList.contains("lfc-has-custom-event-overflow"),
		true,
		"Expected the unified hook to expose its custom compact state."
	);
	const compactOverflowContent = requireElement(
		compactOverflow,
		":scope > .lfc-calendar-event-overflow-content " +
			"> .my-event-overflow-compact",
		dom.window.HTMLSpanElement
	);
	assert.equal(compactOverflowContent.textContent, "+52");
	assert.deepEqual(
		{
			actionBacked: compactOverflowContent.dataset["testActionBacked"],
			date: compactOverflowContent.dataset["testDate"],
			eventCount: compactOverflowContent.dataset["testEventCount"],
			overflowCount: compactOverflowContent.dataset["testOverflowCount"],
			surface: compactOverflowContent.dataset["testSurface"],
			variant: compactOverflowContent.dataset["testVariant"],
			visibleEventCount: compactOverflowContent.dataset["testVisibleEventCount"]
		},
		{
			actionBacked: "false",
			date: "2026-08-06",
			eventCount: "53",
			overflowCount: "52",
			surface: "day",
			variant: "compact",
			visibleEventCount: "1"
		},
		"Expected the compact branch to receive the authoritative adaptive count context."
	);
	assert.ok(
		selectedCell.querySelector(
			'[data-test-event-surface="grid-summary"] .my-event-marker'
		) instanceof dom.window.HTMLSpanElement,
		"The compact event-overflow number must coexist with a custom event marker."
	);
	const selectedOverflowAction = requireElement(
		selectedCell,
		":scope .lfc-calendar-grid-more",
		dom.window.HTMLButtonElement
	);
	const wideOverflow = requireElement(
		selectedOverflowAction,
		":scope > .lfc-calendar-event-overflow.lfc-is-wide",
		dom.window.HTMLSpanElement
	);
	const wideOverflowContent = requireElement(
		wideOverflow,
		":scope > .lfc-calendar-event-overflow-content",
		dom.window.HTMLSpanElement
	);
	const customOverflowContent = requireElement(
		wideOverflowContent,
		":scope > .my-event-overflow-wide",
		dom.window.HTMLSpanElement
	);
	assert.equal(
		wideOverflowContent.querySelector(".lfc-event-overflow-default-content"),
		null,
		"Expected custom wide DOM to replace only the variant's package visual."
	);
	assert.equal(wideOverflow.getAttribute("aria-hidden"), "true");
	assert.equal(customOverflowContent.ownerDocument, document);
	assert.equal(customOverflowContent.textContent, "51 additionalin agenda");
	assert.equal(
		customOverflowContent.querySelector(
			":scope > .my-event-overflow-wide-count"
		)?.textContent,
		"51 additional"
	);
	assert.equal(
		customOverflowContent.querySelector(
			":scope > .my-event-overflow-wide-destination"
		)?.textContent,
		"in agenda"
	);
	assert.deepEqual(
		{
			actionBacked: customOverflowContent.dataset["testActionBacked"],
			date: customOverflowContent.dataset["testDate"],
			eventCount: customOverflowContent.dataset["testEventCount"],
			overflowCount: customOverflowContent.dataset["testOverflowCount"],
			surface: customOverflowContent.dataset["testSurface"],
			variant: customOverflowContent.dataset["testVariant"],
			visibleEventCount: customOverflowContent.dataset["testVisibleEventCount"]
		},
		{
			actionBacked: "true",
			date: "2026-08-06",
			eventCount: "53",
			overflowCount: "51",
			surface: "grid-summary",
			variant: "wide",
			visibleEventCount: "2"
		},
		"Expected the wide branch to receive the authoritative adaptive count context."
	);
	assert.equal(
		customOverflowContent.querySelector("a, button, input, select, textarea, [tabindex]"),
		null,
		"Custom overflow content must remain noninteractive."
	);
	assert.equal(
		wideOverflow.classList.contains("lfc-has-custom-event-overflow"),
		true,
		"Expected the wide variant root to expose its custom-content state."
	);
	assert.match(
		selectedOverflowAction.getAttribute("aria-label") ?? "",
		/^View 51 more items for /u,
		"Custom visual content must not replace the native overflow action's localized name."
	);

	selectedDay.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "F2"
	}));
	assert.equal(document.activeElement, selectedGridActions[0], "F2 must enter the first grid action.");
	selectedGridActions[0]?.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "ArrowUp"
	}));
	assert.equal(document.activeElement, selectedGridActions[0], "Up must not wrap from the first action.");
	selectedGridActions[0]?.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "ArrowDown"
	}));
	assert.equal(document.activeElement, selectedGridActions[1], "Down must move to the next grid action.");
	selectedGridActions[1]?.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "Escape"
	}));
	assert.equal(document.activeElement, selectedDay, "Escape must return focus to the day proxy.");

	const previousDate = requireElement(
		host,
		'[role="gridcell"] > button[data-lfc-date="2026-08-05"]',
		dom.window.HTMLButtonElement
	);
	previousDate.click();
	await waitFor(() => selectedDate.textContent === "2026-08-05", "the overflow test setup selection");
	const actionBeforeOverflow = actionResult.textContent;
	const representedDay = requireElement(
		host,
		'[role="gridcell"] > button[data-lfc-date="2026-08-06"]',
		dom.window.HTMLButtonElement
	);
	const representedCell = representedDay.closest('[role="gridcell"]');
	assert.ok(representedCell instanceof dom.window.HTMLElement);
	const overflowAction = requireElement(
		representedCell,
		".lfc-calendar-grid-more",
		dom.window.HTMLButtonElement
	);
	overflowAction.click();
	await waitFor(() => selectedDate.textContent === "2026-08-06", "the native grid overflow action");
	assert.equal(
		actionResult.textContent,
		actionBeforeOverflow,
		"Custom overflow content must not change the native action or call onDaySelect."
	);
	const agendaHeadingId = agenda.getAttribute("aria-labelledby");
	assert.notEqual(agendaHeadingId, null);
	assert.equal(
		document.activeElement,
		document.getElementById(agendaHeadingId),
		"The native overflow action must still transfer focus to the agenda heading."
	);

	const initialAgendaActions = getAgendaActions(host);
	assert.equal(initialAgendaActions.length, 10, "Expected the configured initial agenda page size.");
	const staleMountedEvent = initialAgendaActions[0];
	assert.ok(staleMountedEvent instanceof dom.window.HTMLButtonElement);
	assert.equal(
		staleMountedEvent.classList.contains("my-event-milestone"),
		true,
		"Expected eventDidMount output."
	);
	const taskButton = requireAgendaAction(host, TASK_ID);
	assert.equal(
		taskButton.querySelector(".my-event-marker"),
		null,
		"Expected renderEventMarker to suppress task markers."
	);

	const initialAppointment = requireAgendaAction(host, APPOINTMENT_ID);
	assert.ok(initialAppointment instanceof dom.window.HTMLAnchorElement, "A URL event must render as an anchor.");
	assert.equal(initialAppointment.pathname, "/examples/advanced/");
	assert.equal(initialAppointment.search, "?event=design-review&from=calendar");
	assert.equal(initialAppointment.hash, "#my-calendar-title");
	const fallbackAppointment = document.querySelector("[data-my-fallback] a");
	assert.ok(fallbackAppointment instanceof dom.window.HTMLAnchorElement);
	assert.equal(fallbackAppointment.pathname, "/examples/advanced/");
	assert.equal(fallbackAppointment.search, "?event=design-review&from=fallback");
	assert.equal(fallbackAppointment.hash, "#my-fallback-title");
	assert.ok(
		initialAppointment.querySelector("time[datetime=\"2026-08-06T11:38\"]") instanceof
			dom.window.HTMLTimeElement,
		"Expected native event-time markup."
	);
	assert.equal(initialAppointment.querySelector(".my-event-marker")?.textContent, "A");
	assert.equal(initialAppointment.querySelector(".my-item-type")?.textContent, "appointment");
	assert.equal(initialAppointment.querySelector(".my-status")?.textContent, "Confirmed");
	assert.equal(initialAppointment.querySelector(".my-action-hint")?.textContent, "View details");
	const accessibleAppointmentName = initialAppointment.getAttribute("aria-label") ?? "";
	const localizedAppointmentTime = initialAppointment.getAttribute("data-test-time-text") ?? "";
	assert.notEqual(localizedAppointmentTime, "", "Expected localized appointment time context.");
	assert.ok(
		accessibleAppointmentName.includes(localizedAppointmentTime) &&
			accessibleAppointmentName.includes(APPOINTMENT_TITLE),
		"Expected the custom agenda name to include the localized time and visible title."
	);

	for (let page = 2; page <= 5; page += 1) {
		const moreButton = findAgendaMoreButton(agenda);
		assert.ok(moreButton instanceof dom.window.HTMLButtonElement, "Expected an agenda paging button.");
		assert.equal(moreButton.textContent, "Load 10 more");
		moreButton.click();
		await waitFor(
			() => getAgendaActions(host).length === page * 10,
			`agenda page ${page}`
		);
	}
	assert.equal(staleMountedEvent.isConnected, false, "Expected paging to replace prior event nodes.");
	assert.equal(
		staleMountedEvent.classList.contains("my-event-milestone"),
		false,
		"Expected extension cleanup to remove mount-owned state."
	);
	assert.equal(findAgendaMoreButton(agenda), null, "The DOM cap must stop paging.");
	assert.equal(
		agenda.querySelector("p")?.textContent,
		"Showing 50 of 53 items"
	);
	await waitFor(
		() => document.querySelector("[data-my-announcer-polite]")?.textContent ===
			"Showing 50 of 53 items",
		"the host-owned polite announcement"
	);
	assert.ok(
		findAgendaAction(host, POINT_APPOINTMENT_ID) !== null,
		"Expected a point event with an omitted end."
	);

	const ineligibleLink = requireAgendaAction(host, "milestone:12");
	assert.ok(ineligibleLink instanceof dom.window.HTMLAnchorElement);
	const resultBeforeNativeContext = actionResult.textContent;
	const nativeContext = new dom.window.MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true
	});
	ineligibleLink.dispatchEvent(nativeContext);
	assert.equal(nativeContext.defaultPrevented, false, "An ineligible link must retain its native menu.");
	assert.equal(actionResult.textContent, resultBeforeNativeContext);

	let eventButton = requireAgendaAction(host, APPOINTMENT_ID);
	eventButton.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "F10",
		shiftKey: true
	}));
	await waitFor(
		() => actionResult.textContent.includes("Event menu for Design review") &&
			actionResult.textContent.includes("from agenda with keydown on a"),
		"the event keyboard context action"
	);

	const agendaActivation = new dom.window.MouseEvent("click", {
		bubbles: true,
		cancelable: true
	});
	eventButton.dispatchEvent(agendaActivation);
	assert.equal(agendaActivation.defaultPrevented, true, "The fixture must prevent URL navigation synchronously.");
	await waitFor(() => eventDialog.open, "the advanced event-details dialog");
	assert.equal(actionResult.textContent, "Opened Design review from agenda with click on a.");
	assert.equal(
		eventDialog.querySelector("[data-my-event-dialog-title]")?.textContent,
		"Design review"
	);
	assert.equal(
		eventDialog.querySelector("[data-my-event-dialog-category]")?.textContent,
		"Appointment"
	);
	assert.equal(
		eventDialog.querySelector("[data-my-event-dialog-status]")?.textContent,
		"Confirmed"
	);
	assert.equal(
		eventDialog.querySelector("[data-my-event-dialog-occurrence]")?.textContent,
		"2026-08-06"
	);
	assert.equal(
		eventDialog.querySelector("[data-my-event-dialog-start]")?.textContent,
		"2026-08-06 at 11:38"
	);
	assert.equal(
		eventDialog.querySelector("[data-my-event-dialog-end]")?.textContent,
		"2026-08-06 at 12:23"
	);
	const dialogEndTime = requireElement(
		eventDialog,
		"[data-my-event-dialog-end]",
		dom.window.HTMLTimeElement
	);
	const dialogNoEnd = requireElement(
		eventDialog,
		"[data-my-event-dialog-no-end]",
		dom.window.HTMLElement
	);
	assert.equal(dialogEndTime.hidden, false);
	assert.equal(dialogEndTime.dateTime, "2026-08-06T12:23");
	assert.equal(dialogNoEnd.hidden, true);
	assert.equal(
		document.activeElement,
		eventDialog.querySelector("[autofocus]"),
		"The dialog close action should receive initial focus."
	);
	eventDialog.close();

	const pointAppointment = requireAgendaAction(host, POINT_APPOINTMENT_ID);
	pointAppointment.click();
	await waitFor(() => eventDialog.open, "the point-event details dialog");
	assert.equal(dialogEndTime.hidden, true);
	assert.equal(dialogEndTime.hasAttribute("datetime"), false);
	assert.equal(dialogEndTime.textContent, "");
	assert.equal(dialogNoEnd.hidden, false);
	assert.equal(dialogNoEnd.textContent, "No end time");
	eventDialog.close();

	const selectedBeforeGridActivation = selectedDate.textContent;
	const gridEvent = requireElement(
		host,
		'[data-test-event-id="appointment:45"][data-test-event-surface="grid-summary"]',
		dom.window.HTMLButtonElement
	);
	gridEvent.click();
	await waitFor(() => eventDialog.open, "the grid event-details dialog");
	assert.equal(actionResult.textContent, "Opened Follow-up call from grid-summary with click on button.");
	assert.equal(
		selectedDate.textContent,
		selectedBeforeGridActivation,
		"Direct grid-event activation must not select the represented day."
	);
	eventDialog.close();

	const { button: currentDay } = requireSelectedDay(host);
	currentDay.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "ContextMenu"
	}));
	await waitFor(
		() => actionResult.textContent.includes("Day menu for 2026-08-06") &&
			actionResult.textContent.includes("keydown on button"),
		"the day keyboard context action"
	);
	currentDay.click();
	await waitFor(
		() => actionResult.textContent === "Selected 2026-08-06 with click on button.",
		"the committed day-selection action"
	);

	clickCommand(document, "getState");
	assert.equal(actionResult.textContent, "Read ready state for 2026-08-06.");
	clickCommand(document, "next");
	await waitFor(
		() => displayedMonth.textContent === "2026-09-01" && phase.textContent === "ready",
		"next() navigation"
	);
	assert.equal(selectedDate.textContent, "2026-09-06");
	clickCommand(document, "prev");
	await waitFor(
		() => displayedMonth.textContent === "2026-08-01" && phase.textContent === "ready",
		"prev() navigation"
	);
	clickCommand(document, "prev");
	await waitFor(
		() => displayedMonth.textContent === "2026-07-01" && phase.textContent === "ready",
		"prev() navigation into the partial minimum month"
	);
	assert.equal(selectedDate.textContent, "2026-07-15", "The preferred day must clamp to minDate.");
	assert.equal(
		document.querySelector("[data-my-state-range]")?.textContent,
		"2026-06-29 to 2026-08-10 (exclusive)",
		"The partial minimum month must retain its complete 42-day provider range."
	);
	assert.equal(
		host.querySelector(".lfc-calendar-nav-button-previous")?.getAttribute("aria-disabled"),
		"true",
		"Previous must expose its guarded boundary state in the first allowed month."
	);
	clickCommand(document, "prev");
	assert.equal(displayedMonth.textContent, "2026-07-01", "prev() must stop at minDate.");
	clickCommand(document, "next");
	await waitFor(
		() => displayedMonth.textContent === "2026-08-01" && phase.textContent === "ready",
		"returning from the partial minimum month"
	);

	const dateInput = requireElement(document, "[data-my-target-date]", dom.window.HTMLInputElement);
	const dateError = requireElement(
		document,
		"[data-my-target-date-error]",
		dom.window.HTMLElement
	);
	const unchangedMonth = displayedMonth.textContent;
	const unchangedSelection = selectedDate.textContent;
	dateInput.value = "";
	dateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	clickCommand(document, "focusDate");
	await waitFor(
		() => dateInput.getAttribute("aria-invalid") === "true" && !dateError.hidden &&
			assertiveAnnouncer.textContent === dateError.textContent,
		"empty target-date validation"
	);
	assert.equal(document.activeElement, dateInput);
	assert.equal(displayedMonth.textContent, unchangedMonth);
	assert.equal(selectedDate.textContent, unchangedSelection);
	assert.equal(dateInput.getAttribute("aria-errormessage"), dateError.id);
	assert.equal(observedErrors.length, 0);
	assert.equal(uncaughtErrors.length, 0);

	dateInput.value = "2027-09-16";
	dateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	assert.equal(dateInput.checkValidity(), false);
	assert.equal(dateInput.hasAttribute("aria-invalid"), false);
	assert.equal(dateError.hidden, true);
	clickCommand(document, "gotoDate");
	await waitFor(
		() => dateInput.getAttribute("aria-invalid") === "true" && !dateError.hidden &&
			assertiveAnnouncer.textContent === dateError.textContent,
		"out-of-range target-date validation"
	);
	assert.equal(displayedMonth.textContent, unchangedMonth);
	assert.equal(selectedDate.textContent, unchangedSelection);
	assert.equal(observedErrors.length, 0);
	assert.equal(uncaughtErrors.length, 0);

	dateInput.removeAttribute("max");
	dateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	assert.equal(
		dateInput.checkValidity(),
		true,
		"The widened application input must let the public method validate the date."
	);
	clickCommand(document, "gotoDate");
	await waitFor(
		() => dateInput.getAttribute("aria-invalid") === "true" && !dateError.hidden,
		"the LitefoldCalendarError application-boundary catch"
	);
	assert.equal(displayedMonth.textContent, unchangedMonth);
	assert.equal(selectedDate.textContent, unchangedSelection);
	assert.equal(observedErrors.length, 0);
	assert.equal(uncaughtErrors.length, 0);
	dateInput.max = "2027-09-15";

	dateInput.value = "2027-09-12";
	dateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	assert.equal(dateInput.hasAttribute("aria-invalid"), false);
	assert.equal(dateError.hidden, true);
	assert.equal(assertiveAnnouncer.textContent, "");
	clickCommand(document, "gotoDate");
	await waitFor(
		() => displayedMonth.textContent === "2027-09-01" && phase.textContent === "ready",
		"gotoDate() navigation"
	);
	clickCommand(document, "next");
	assert.equal(displayedMonth.textContent, "2027-09-01", "next() must stop at maxDate.");
	dateInput.value = "2026-08-07";
	clickCommand(document, "focusDate");
	await waitFor(
		() => selectedDate.textContent === "2026-08-07" && phase.textContent === "ready",
		"focusDate() selection"
	);
	clickCommand(document, "today");
	await waitFor(
		() => selectedDate.textContent === "2026-08-06" && phase.textContent === "ready",
		"today() using a Date projected through the configured time zone"
	);
	dateInput.value = "2026-08-07";
	clickCommand(document, "focusDate");
	await waitFor(() => selectedDate.textContent === "2026-08-07", "a setup selection");
	clickCommand(document, "focusToday");
	await waitFor(
		() => selectedDate.textContent === "2026-08-06",
		"focusToday() using the configured clock"
	);

	const direction = requireElement(document, "[data-my-direction]", dom.window.HTMLInputElement);
	direction.checked = true;
	direction.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	assert.equal(host.dir, "rtl", "Expected the host-owned direction control to exercise RTL.");
	const theme = requireElement(
		document,
		"[data-my-theme-control]",
		dom.window.HTMLSelectElement
	);
	theme.value = "dark";
	theme.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	assert.equal(document.documentElement.getAttribute("data-my-theme"), "dark");

	const appointmentFilter = requireElement(
		document,
		'[data-my-type-filter][value="appointment"]',
		dom.window.HTMLInputElement
	);
	eventButton = requireAgendaAction(host, APPOINTMENT_ID);
	appointmentFilter.checked = false;
	appointmentFilter.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	await waitFor(
		() => findAgendaAction(host, APPOINTMENT_ID) === null && phase.textContent === "ready",
		"a filtered refetch"
	);
	assert.equal(
		eventButton.classList.contains("my-event-appointment"),
		false,
		"Expected refetch to run event mount cleanup."
	);
	appointmentFilter.checked = true;
	appointmentFilter.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	await waitFor(
		() => findAgendaAction(host, APPOINTMENT_ID) !== null && phase.textContent === "ready",
		"restoring a filtered category"
	);
	const immediateRenderCount = readCompletedGridRenderCount(gridRenders);
	clickCommand(document, "refetchEvents");
	assert.equal(phase.textContent, "ready", "An immediate refetch must commit synchronously.");
	assert.notEqual(host.getAttribute("aria-busy"), "true", "An immediate refetch must not mark the host busy.");
	assert.equal(busyState.textContent, "false");
	assert.equal(completePending.disabled, true);
	assert.equal(
		readCompletedGridRenderCount(gridRenders),
		immediateRenderCount + 1,
		"An immediate refetch must complete exactly one additional 42-day grid render."
	);
	assert.doesNotMatch(
		phaseHistory.textContent ?? "",
		/loading/u,
		"Immediate array results must not manufacture a loading phase."
	);

	const replacementRenderCount = readCompletedGridRenderCount(gridRenders);
	clickCommand(document, "setEvents");
	await waitFor(
		() => (host.textContent ?? "").includes("Dynamically replaced schedule") &&
			phase.textContent === "ready",
		"the setEvents() replacement"
	);
	assert.equal(sourceTiming.value, "immediate", "A static replacement must use immediate timing.");
	assert.notEqual(host.getAttribute("aria-busy"), "true");
	assert.equal(
		readCompletedGridRenderCount(gridRenders),
		replacementRenderCount + 1,
		"A static replacement must complete in one grid render."
	);
	assert.doesNotMatch(host.textContent ?? "", /Design review/u);
	const replacementAction = requireAgendaAction(host, "dynamic-replacement");
	assert.ok(replacementAction instanceof dom.window.HTMLAnchorElement, "A replacement URL event must render as an anchor.");
	assert.equal(replacementAction.pathname, "/examples/advanced/");
	assert.equal(replacementAction.search, "?event=dynamic-replacement&from=calendar");
	assert.equal(replacementAction.hash, "#my-calendar-title");
	clickCommand(document, "refetchEvents");
	await waitFor(
		() => (host.textContent ?? "").includes("Dynamically replaced schedule") &&
			phase.textContent === "ready",
		"refetchEvents() using the latest replacement"
	);

	const controlledRenderCount = readCompletedGridRenderCount(gridRenders);
	sourceTiming.value = "controlled";
	sourceTiming.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	assert.equal(phase.textContent, "loading", "A controlled PromiseLike must expose loading synchronously.");
	assert.equal(host.getAttribute("aria-busy"), "true", "A controlled PromiseLike must mark the host busy.");
	assert.equal(completePending.disabled, false, "Controlled work must enable its completion control.");
	assert.equal(
		readCompletedGridRenderCount(gridRenders),
		controlledRenderCount + 1,
		"Starting controlled work must complete the loading grid render."
	);
	await waitFor(() => busyState.textContent === "true", "the host-busy observation for controlled work");
	assert.match(phaseHistory.textContent ?? "", /loading$/u);
	completePending.click();
	await waitFor(
		() => phase.textContent === "ready" && busyState.textContent === "false" &&
			findAgendaAction(host, APPOINTMENT_ID) !== null,
		"completion of the controlled PromiseLike source"
	);
	assert.notEqual(host.getAttribute("aria-busy"), "true");
	assert.equal(completePending.disabled, true, "Completed controlled work must clear its pending control.");
	assert.equal(
		readCompletedGridRenderCount(gridRenders),
		controlledRenderCount + 2,
		"Completing controlled work must add one committed grid render."
	);
	assert.match(
		phaseHistory.textContent ?? "",
		/loading → ready$/u,
		"Controlled completion must preserve the observable phase transition."
	);

	const abortedRenderCount = readCompletedGridRenderCount(gridRenders);
	sourceTiming.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	assert.equal(phase.textContent, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	assert.equal(completePending.disabled, false);
	assert.equal(readCompletedGridRenderCount(gridRenders), abortedRenderCount + 1);
	await waitFor(() => busyState.textContent === "true", "the controlled request selected for abort");
	sourceTiming.value = "immediate";
	sourceTiming.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	assert.equal(phase.textContent, "ready", "Switching to immediate must synchronously supersede controlled work.");
	assert.notEqual(host.getAttribute("aria-busy"), "true");
	assert.equal(completePending.disabled, true, "Aborted controlled work must release its completion control.");
	assert.equal(
		readCompletedGridRenderCount(gridRenders),
		abortedRenderCount + 2,
		"Superseding controlled work must complete one immediate provider render."
	);
	await waitFor(
		() => busyState.textContent === "false" && findAgendaAction(host, APPOINTMENT_ID) !== null,
		"the immediate provider restored after abort"
	);
	assert.equal(
		actionResult.textContent,
		"Restored the provider with an immediate array result."
	);
	assert.match(phaseHistory.textContent ?? "", /loading → ready$/u);
	assert.equal(
		(phaseHistory.textContent ?? "").split(" → ").length,
		8,
		"The phase history must retain only its eight most recent observations."
	);

	//Restore deterministic fixture state before exercising teardown.
	direction.checked = false;
	direction.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	theme.value = "system";
	theme.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	dateInput.value = "2026-08-07";
	dateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	assert.equal(sourceTiming.value, "immediate");
	assert.equal(host.dir, "ltr");
	assert.equal(document.documentElement.hasAttribute("data-my-theme"), false);
	assert.equal(displayedMonth.textContent, "2026-08-01");
	assert.equal(selectedDate.textContent, "2026-08-06");
	assert.equal(appointmentFilter.checked, true);
	assert.equal(findAgendaAction(host, APPOINTMENT_ID) !== null, true);
	assert.equal(completePending.disabled, true);
	assert.notEqual(host.getAttribute("aria-busy"), "true");
	assert.equal(busyState.textContent, "false");

	assert.equal(observedErrors.length, 0, "The advanced example must not report calendar errors.");
	assert.equal(uncaughtErrors.length, 0, "The advanced example must not leak DOM event errors.");
	dom.window.dispatchEvent(new dom.window.Event("pagehide"));
	assert.equal(eventDialog.open, false, "pagehide must close the application-owned dialog.");
	assert.equal(fallbackElement.hidden, false, "Destroy must restore the fallback's original state.");
	assert.equal(host.childElementCount, 0, "pagehide must destroy and clear the calendar host.");
	assert.equal(host.hasAttribute("data-litefold-calendar"), false, "pagehide must remove calendar ownership.");
}
