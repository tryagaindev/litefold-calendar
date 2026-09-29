import { createCalendar } from "../../dist/index.js";

const host = document.querySelector("[data-my-calendar]");
const result = document.querySelector("[data-my-result]");

if (!(host instanceof HTMLElement) || !(result instanceof HTMLElement)) {
	throw new Error("The example markup is incomplete.");
}

//Use local noon so adding civil days stays stable across daylight-saving transitions.
const exampleDate = new Date();
exampleDate.setHours(12, 0, 0, 0);

function dateFromToday(dayOffset) {
	const value = new Date(exampleDate);
	value.setDate(value.getDate() + dayOffset);
	return [
		String(value.getFullYear()).padStart(4, "0"),
		String(value.getMonth() + 1).padStart(2, "0"),
		String(value.getDate()).padStart(2, "0")
	].join("-");
}

const TODAY = dateFromToday(0);
const IN_TWO_DAYS = dateFromToday(2);
const IN_THREE_DAYS = dateFromToday(3);

const EVENTS = [
	{
		id: "release-window",
		title: "Alpha release window",
		start: TODAY,
		end: IN_TWO_DAYS,
		accentColor: "#008577"
	},
	{
		id: "design-review",
		title: "Calendar design review",
		start: `${TODAY}T11:38`,
		end: `${TODAY}T12:23`,
		accentColor: "#805FC0"
	},
	{
		id: "documentation",
		title: "Documentation walkthrough",
		start: `${IN_THREE_DAYS}T13:00`,
		end: `${IN_THREE_DAYS}T14:00`,
		url: "/events/documentation?from=calendar#details"
	}
];

const calendar = createCalendar(host, {
	events: EVENTS,
	onEventActivate: ({ element, event, nativeEvent, surface }) => {
		if (element instanceof HTMLAnchorElement) {
			//Keep the standalone demo on this page; production event links can navigate normally.
			nativeEvent.preventDefault();
		}
		result.textContent = `Opened ${event.title} from the ${surface} surface.`;
	}
});

calendar.render();

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		calendar.destroy();
	}
});
