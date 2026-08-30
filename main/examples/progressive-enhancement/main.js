import { createCalendar } from "../../dist/index.js";

const host = document.querySelector("[data-my-calendar]");
const fallbackElement = document.querySelector("[data-my-fallback]");
const controls = document.querySelector("[data-my-controls]");
const result = document.querySelector("[data-my-result]");
const politeAnnouncer = document.querySelector("[data-my-announcer-polite]");
const assertiveAnnouncer = document.querySelector("[data-my-announcer-assertive]");
const failureButton = document.querySelector('[data-my-rebuild="failure"]');
const successButton = document.querySelector('[data-my-rebuild="success"]');

if (!(host instanceof HTMLElement) ||
	!(fallbackElement instanceof HTMLElement) ||
	!(controls instanceof HTMLElement) ||
	!(result instanceof HTMLElement) ||
	!(politeAnnouncer instanceof HTMLElement) ||
	!(assertiveAnnouncer instanceof HTMLElement) ||
	!(failureButton instanceof HTMLButtonElement) ||
	!(successButton instanceof HTMLButtonElement)) {
	throw new Error("The progressive-enhancement example markup is incomplete.");
}

const SOURCE_DELAY_MS = 80;
const EVENTS = [
	{
		id: "release-window",
		title: "Release window",
		start: "2026-08-04",
		end: "2026-08-06",
		accentColor: "#008577"
	},
	{
		id: "design-review",
		title: "Calendar design review",
		start: "2026-08-04T11:38",
		end: "2026-08-04T12:23",
		url: "./?event=design-review&from=calendar#my-server-schedule"
	}
];

//Keep the loading state visible while modeling an abort-aware event provider.
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
	}, SOURCE_DELAY_MS);
	signal.addEventListener("abort", handleAbort, { once: true });
});

const isSourceError = (error) => error.code === "event-source-failed" ||
	error.code === "event-data-invalid" ||
	error.code === "event-limit-exceeded";

let calendar = null;
let announcementRevision = 0;

const reportResult = (message, politeness) => {
	result.textContent = message;
	const target = politeness === "assertive" ? assertiveAnnouncer : politeAnnouncer;
	const revision = ++announcementRevision;
	politeAnnouncer.textContent = "";
	assertiveAnnouncer.textContent = "";

	//A separate DOM update lets assistive technology announce repeated messages.
	queueMicrotask(() => {
		if (revision === announcementRevision) {
			target.textContent = message;
		}
	});
};

const rebuildCalendar = (mode) => {
	//Destroy restores the fallback before the replacement starts loading.
	calendar?.destroy();
	document.documentElement.dataset.testReady = "false";
	reportResult("Loading the enhanced calendar. The fallback remains available.", "polite");

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
			if (isSourceError(error)) {
				reportResult(
					`${error.userTitle}. ${error.userMessage} The server-rendered schedule remains available.`,
					"assertive"
				);
				return "handled";
			}
			return "default";
		},
		onStateChange: (state) => {
			document.documentElement.dataset.testPhase = state.phase;
			if (state.phase === "ready") {
				document.documentElement.dataset.testReady = "true";
				reportResult("The usable calendar is ready, so the fallback is hidden.", "polite");
			}
		}
	});
	calendar.render();
};

failureButton.addEventListener("click", () => {
	rebuildCalendar("failure");
});

successButton.addEventListener("click", () => {
	rebuildCalendar("success");
});

controls.hidden = false;
rebuildCalendar("success");

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		calendar?.destroy();
	}
});
