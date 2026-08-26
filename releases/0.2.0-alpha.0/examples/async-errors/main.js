import { createCalendar } from "../../dist/index.js";

const getElement = (selector, constructor) => {
	const element = document.querySelector(selector);
	if (!(element instanceof constructor)) {
		throw new Error(`Missing example element: ${selector}`);
	}

	return element;
};

const host = getElement("[data-calendar]", HTMLElement);
const applicationOwnership = getElement("[data-host-ownership]", HTMLInputElement);
const failExtension = getElement("[data-fail-extension]", HTMLInputElement);
const failAction = getElement("[data-fail-action]", HTMLInputElement);
const failNextButton = getElement("[data-fail-next]", HTMLButtonElement);
const refetchButton = getElement("[data-refetch]", HTMLButtonElement);
const applicationError = getElement("[data-host-error]", HTMLElement);
const applicationErrorTitle = getElement("[data-host-error-title]", HTMLElement);
const applicationErrorMessage = getElement("[data-host-error-message]", HTMLElement);
const applicationRetry = getElement("[data-host-retry]", HTMLButtonElement);
const politeAnnouncer = getElement("[data-announcer-polite]", HTMLElement);
const assertiveAnnouncer = getElement("[data-announcer-assertive]", HTMLElement);

let failNextSourceRequest = false;
let applicationErrorActive = false;

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

const EVENTS = Object.freeze([
	Object.freeze({
		id: "async-demo",
		title: "Open async details",
		start: "2026-08-04T14:00",
		end: "2026-08-04T14:30",
		accentColor: "#008577"
	})
]);

const eventDetailsExtension = Object.freeze({
	id: "async-errors-event-details",
	renderEventDetails: ({ document: ownerDocument }) => {
		if (failExtension.checked) {
			throw new Error("Demonstration extension failure with developer-only detail.");
		}

		const detail = ownerDocument.createElement("span");
		detail.textContent = "Extension active";
		return detail;
	}
});

const hideApplicationError = () => {
	applicationErrorActive = false;
	applicationError.hidden = true;
	applicationErrorTitle.textContent = "";
	applicationErrorMessage.textContent = "";
};

const announceExternally = ({ message, politeness }) => {
	const target = politeness === "assertive" ? assertiveAnnouncer : politeAnnouncer;
	const other = politeness === "assertive" ? politeAnnouncer : assertiveAnnouncer;
	other.textContent = "";
	target.textContent = "";
	queueMicrotask(() => {
		target.textContent = message;
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
	extensions: [eventDetailsExtension],
	onEventActivate: async () => {
		await Promise.resolve();
		if (failAction.checked) {
			throw new Error("Demonstration action failure with developer-only detail.");
		}
	},
	onError: (error) => {
		console.warn("Observed calendar error", error);
		const isSourceError = error.code === "event-source-failed" ||
			error.code === "event-data-invalid" ||
			error.code === "event-limit-exceeded";
		if (!applicationOwnership.checked || !isSourceError) {
			return "default";
		}

		applicationErrorTitle.textContent = error.userTitle;
		applicationErrorMessage.textContent = error.userMessage;
		applicationError.hidden = false;
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

applicationRetry.addEventListener("click", () => {
	calendar.refetchEvents();
});

failExtension.addEventListener("change", () => {
	calendar.destroy();
	failNextSourceRequest = false;
	hideApplicationError();
	calendar = createExampleCalendar();
	calendar.render();
});

calendar.render();

window.addEventListener("pagehide", () => {
	calendar.destroy();
}, { once: true });
