import { createCalendar } from "../../dist/index.js";

const host = document.querySelector("[data-example-calendar]");
const fallbackElement = document.querySelector("[data-example-fallback]");
const result = document.querySelector("[data-example-result]");
const rebuildButtons = [...document.querySelectorAll("[data-example-rebuild]")];

if (!(host instanceof HTMLElement) ||
	!(fallbackElement instanceof HTMLElement) ||
	!(result instanceof HTMLElement) ||
	!rebuildButtons.every((button) => button instanceof HTMLButtonElement)) {
	throw new Error("The progressive-enhancement example markup is incomplete.");
}

const EVENTS = Object.freeze([
	Object.freeze({
		id: "release-window",
		title: "Release window",
		start: "2026-08-04",
		end: "2026-08-06",
		accentColor: "#008577"
	}),
	Object.freeze({
		id: "design-review",
		title: "Calendar design review",
		start: "2026-08-04T09:30",
		end: "2026-08-04T10:15",
		url: "/events/design-review?from=calendar&view=summary#details"
	})
]);

const waitForSource = (signal) => new Promise((resolve, reject) => {
	if (signal.aborted) {
		reject(signal.reason);
		return;
	}

	const handleAbort = () => {
		clearTimeout(timeoutId);
		reject(signal.reason);
	};
	const timeoutId = setTimeout(() => {
		signal.removeEventListener("abort", handleAbort);
		resolve();
	}, 80);
	signal.addEventListener("abort", handleAbort, { once: true });
});

let calendar;

const buildCalendar = (mode) => {
	calendar?.destroy();
	document.documentElement.dataset["exampleReady"] = "false";
	result.textContent = "Loading the enhanced calendar. The fallback remains available.";

	calendar = createCalendar(host, {
		events: async ({ signal }) => {
			await waitForSource(signal);
			signal.throwIfAborted();
			if (mode === "failure") {
				throw new Error("Demonstration source failure.");
			}
			return EVENTS;
		},
		fallbackElement,
		initialDate: "2026-08-04",
		onError: (error) => {
			if (error.code === "event-source-failed" || error.code === "event-data-invalid") {
				result.textContent = `${error.userTitle}. ${error.userMessage} The fallback remains visible.`;
				return "handled";
			}
			return "default";
		},
		onStateChange: (state) => {
			document.documentElement.dataset["examplePhase"] = state.phase;
			if (state.phase === "ready") {
				document.documentElement.dataset["exampleReady"] = "true";
				result.textContent = "The usable calendar is ready, so the fallback is hidden.";
			} else if (state.phase === "unavailable") {
				result.textContent = "No usable calendar snapshot is available, so the fallback remains visible.";
			}
		}
	});
	calendar.render();
};

for (const button of rebuildButtons) {
	button.addEventListener("click", () => {
		buildCalendar(button.dataset["exampleRebuild"] === "failure" ? "failure" : "success");
	});
}

buildCalendar("success");

window.addEventListener("pagehide", () => {
	calendar?.destroy();
}, { once: true });
