import { createCalendar } from "../../dist/index.js";

const getElement = (selector, constructor) => {
	const element = document.querySelector(selector);
	if (!(element instanceof constructor)) {
		throw new Error(`Missing example element: ${selector}`);
	}

	return element;
};

const host = getElement("[data-my-calendar]", HTMLElement);
const applicationOwnsSourceErrors = getElement("[data-my-host-ownership]", HTMLInputElement);
const failRenderHooks = getElement("[data-my-fail-render-hooks]", HTMLInputElement);
const failEventActions = getElement("[data-my-fail-action]", HTMLInputElement);
const failNextButton = getElement("[data-my-fail-next]", HTMLButtonElement);
const refetchButton = getElement("[data-my-refetch]", HTMLButtonElement);
const applicationErrorRegion = getElement("[data-my-host-error]", HTMLElement);
const applicationErrorTitle = getElement("[data-my-host-error-title]", HTMLElement);
const applicationErrorMessage = getElement("[data-my-host-error-message]", HTMLElement);
const applicationRetryButton = getElement("[data-my-host-retry]", HTMLButtonElement);
const politeAnnouncer = getElement("[data-my-announcer-polite]", HTMLElement);
const assertiveAnnouncer = getElement("[data-my-announcer-assertive]", HTMLElement);

let failNextSourceRequest = false;
let applicationErrorActive = false;
let announcementRevision = 0;

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
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
	}, milliseconds);

	signal.addEventListener("abort", handleAbort, { once: true });
});

const EVENTS = [
	{
		id: "async-demo",
		title: "Open async details",
		start: "2026-08-04T11:38",
		end: "2026-08-04T12:08",
		accentColor: "#008577"
	}
];

const EVENT_DETAILS_RENDER_HOOKS = {
	id: "my-async-errors-event-details",
	renderEventDetails: ({ document: ownerDocument }) => {
		if (failRenderHooks.checked) {
			throw new Error("Demonstration render-hook failure with developer-only detail.");
		}

		const detail = ownerDocument.createElement("span");
		detail.textContent = "Render hooks active";
		return detail;
	}
};

const SOURCE_ERROR_CODES = new Set([
	"event-source-failed",
	"event-data-invalid",
	"event-limit-exceeded"
]);

const hideApplicationError = () => {
	applicationErrorActive = false;
	applicationErrorRegion.hidden = true;
	applicationErrorTitle.textContent = "";
	applicationErrorMessage.textContent = "";
};

const announceExternally = ({ message, politeness }) => {
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

const createExampleCalendar = () => createCalendar(host, {
	initialDate: "2026-08-04",
	events: async ({ signal }) => {
		const mustFail = failNextSourceRequest;
		failNextSourceRequest = false;
		await wait(450, signal);

		if (mustFail) {
			throw new Error("Demonstration source failure with developer-only detail.");
		}

		return EVENTS;
	},
	renderHooks: [EVENT_DETAILS_RENDER_HOOKS],
	onEventActivate: async () => {
		await Promise.resolve();
		if (failEventActions.checked) {
			throw new Error("Demonstration action failure with developer-only detail.");
		}
	},
	onError: (error) => {
		console.warn("Observed calendar error", error);
		if (!applicationOwnsSourceErrors.checked || !SOURCE_ERROR_CODES.has(error.code)) {
			return "default";
		}

		applicationErrorTitle.textContent = error.userTitle;
		applicationErrorMessage.textContent = error.userMessage;
		applicationErrorRegion.hidden = false;
		applicationErrorActive = true;
		announceExternally({
			message: `${error.userTitle}. ${error.userMessage}`,
			politeness: error.severity === "warning" ? "polite" : "assertive"
		});
		return "handled";
	},
	onAnnounce: announceExternally,
	onStateChange: (state) => {
		if (state.phase === "ready" && state.issues.length === 0) {
			const announceRecovery = applicationErrorActive;
			hideApplicationError();
			if (announceRecovery) {
				announceExternally({ message: "Calendar updated", politeness: "polite" });
			}
		}
	}
});

let calendar = createExampleCalendar();

failNextButton.addEventListener("click", () => {
	failNextSourceRequest = true;
	calendar.refetchEvents();
});

refetchButton.addEventListener("click", () => {
	calendar.refetchEvents();
});

applicationRetryButton.addEventListener("click", () => {
	calendar.refetchEvents();
});

failRenderHooks.addEventListener("change", () => {
	calendar.destroy();
	failNextSourceRequest = false;
	hideApplicationError();
	calendar = createExampleCalendar();
	calendar.render();
});

calendar.render();

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		calendar.destroy();
	}
});
