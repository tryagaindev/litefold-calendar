import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type CalendarEventInput } from "../src/index.js";
import { createDom, dispatchClick, getHost, installDom } from "./helpers/dom.js";
import { createRegisteredExtensionProbe } from "./helpers/registered-extensions.js";

const TARGET_DATE = "2026-07-15";
const EVENTS: readonly CalendarEventInput[] = [0, 1].map((id) => ({
	id: String(id), start: TARGET_DATE, title: "An occurrence"
}));

for (const extensions of [false, true]) {
	for (const boundary of ["mount", "state", "day-focus"] as const) {
		for (const replacement of ["same-date", "away-back", "events", "refetch", "destroy"] as const) {
			void test(`${boundary} ${replacement} supersedes overflow focus (extensions: ${String(extensions)})`, (context) => {
				const dom = createDom();
				context.after(installDom(dom));
				const host = getHost(dom);
				const appButton = dom.window.document.createElement("button");
				dom.window.document.body.append(appButton);
				let armed = false;
				const supersede = (): void => {
					if (!armed) { return; }
					armed = false;
					switch (replacement) {
						case "same-date": calendar.gotoDate(TARGET_DATE); break;
						case "away-back": calendar.gotoDate("2026-07-16"); calendar.gotoDate(TARGET_DATE); break;
						case "events": calendar.setEvents(EVENTS); break;
						case "refetch": calendar.refetchEvents(); break;
						case "destroy": calendar.destroy(); break;
					}
					appButton.focus();
				};
				const calendar = createCalendar(host, {
					events: EVENTS,
					...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "ownership" })] } : {}),
					initialDate: "2026-07-14",
					onStateChange: () => { if (boundary === "state") { supersede(); } },
					renderHooks: [{ id: "ownership", dayDidMount: () => {
						if (boundary === "mount") { supersede(); }
					} }]
				});
				context.after(() => { calendar.destroy(); });
				calendar.render();
				host.addEventListener("focusin", (event) => {
					if (boundary === "day-focus" && event.target instanceof dom.window.HTMLButtonElement &&
						event.target.classList.contains("lfc-calendar-day-button")) { supersede(); }
				});
				const action = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${TARGET_DATE}']`);
				assert.ok(action);
				armed = true;
				dispatchClick(dom, action);
				assert.equal(armed, false, "The chosen reentrancy boundary was exercised.");
				assert.equal(dom.window.document.activeElement, appButton, "The superseded default must not steal focus.");
			});
		}
	}
}
