import { createCalendar } from "../../dist/index.js";
import { loadEvents } from "./source.js";

const host = document.querySelector("[data-my-calendar]");
const category = document.querySelector("[data-my-category]");
const refresh = document.querySelector("[data-my-refresh]");
const result = document.querySelector("[data-my-result]");
const dialog = document.querySelector("[data-my-dialog]");
const dialogTitle = document.querySelector("[data-my-dialog-title]");
const choices = document.querySelector("[data-my-event-choices]");
if (!(host instanceof HTMLElement) || !(category instanceof HTMLSelectElement) ||
	!(refresh instanceof HTMLButtonElement) || !(result instanceof HTMLElement) ||
	!(dialog instanceof HTMLDialogElement) || !(dialogTitle instanceof HTMLElement) ||
	!(choices instanceof HTMLUListElement)) {
	throw new Error("The remote-data example markup is incomplete.");
}

const lifetime = new AbortController();
/** @type {{ element: HTMLElement, dateString: string } | null} */
let returnFocus = null;

const calendar = createCalendar(host, {
	initialDate: "2026-08-06",
	//Read the current filter at invocation so each request has one filter snapshot.
	events: (range) => loadEvents(range, category.value),
	gridEventDisplay: { compact: "count-when-multiple", wide: "count-when-multiple" },
	onEventActivate({ dateString, element, event, nativeEvent }) {
		nativeEvent.preventDefault();
		openChooser([event], dateString, element);
	},
	onEventOverflowActivate({ dateString, element, events, nativeEvent }) {
		//Cancel synchronously, before the library selects or replaces any DOM.
		nativeEvent.preventDefault();
		openChooser(events, dateString, element);
	}
});

/**
 * @param {readonly import("../../dist/index.js").CalendarEvent<import("./source.js").EventMetadata>[]} events
 * @param {string} dateString
 * @param {HTMLElement} element
 */
const openChooser = (events, dateString, element) => {
	returnFocus = { element, dateString };
	dialogTitle.textContent = `Events for ${dateString}`;
	choices.replaceChildren();
	for (const event of events) {
		const item = document.createElement("li");
		const button = document.createElement("button");
		button.type = "button";
		button.className = "my-button";
		button.textContent = `Choose ${event.title}`;
		button.addEventListener("click", () => {
			result.textContent = `Selected ${event.title} for ${dateString}. No server data was changed.`;
			dialog.close();
		}, { once: true });
		item.append(button);
		choices.append(item);
	}
	dialog.showModal();
};

dialog.addEventListener("close", () => {
	const target = returnFocus;
	returnFocus = null;
	choices.replaceChildren();
	if (target === null) {
		return;
	}
	if (target.element.isConnected) {
		target.element.focus();
	}
	//A refetch may replace the invoker while the dialog is open.
	if (document.activeElement !== target.element) {
		calendar.focusDate(target.dateString);
	}
}, { signal: lifetime.signal });

category.addEventListener("change", () => { calendar.refetchEvents(); }, { signal: lifetime.signal });
refresh.addEventListener("click", () => { calendar.refetchEvents(); }, { signal: lifetime.signal });
calendar.render();

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		lifetime.abort();
		returnFocus = null;
		dialog.close();
		calendar.destroy();
	}
}, { signal: lifetime.signal });
