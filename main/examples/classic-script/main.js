"use strict";

const host = document.querySelector("[data-my-calendar]");
const result = document.querySelector("[data-my-result]");
const startupError = document.querySelector("[data-my-startup-error]");

if (!(host instanceof HTMLElement) ||
	!(result instanceof HTMLElement) ||
	!(startupError instanceof HTMLElement)) {
	throw new Error("The classic-script example markup is incomplete.");
}

const EVENTS = [
	{
		id: "release-window",
		title: "Alpha release window",
		start: "2026-08-04",
		end: "2026-08-06"
	},
	{
		id: "design-review",
		title: "Calendar design review",
		start: "2026-08-04T11:38",
		end: "2026-08-04T12:23",
		url: "/events/design-review?from=classic-script#details"
	}
];

function reportStartupFailure(error) {
	startupError.textContent = "The calendar could not start. Check the browser console and try again.";
	if (typeof globalThis.reportError === "function") {
		try {
			globalThis.reportError(error);
		} catch (reportingError) {
			console.error("The calendar example and its global reporter failed.", error, reportingError);
		}
	} else {
		console.error("The calendar example could not start.", error);
	}
}

//Dynamic import works in a classic script even though static imports do not.
void import("../../dist/index.js")
	.then(({ createCalendar }) => {
		const calendar = createCalendar(host, {
			events: EVENTS,
			initialDate: "2026-08-04",
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
	})
	.catch(reportStartupFailure);
