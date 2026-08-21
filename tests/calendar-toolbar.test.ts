import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type Calendar } from "../src/index.js";
import { createDom, getHost, installDom, waitFor } from "./helpers/dom.js";

void test("toolbar navigation keeps chevrons at the start and Today at the end", async (context) => {
    const dom = createDom();
    const restore = installDom(dom);
    context.after(restore);
    const host = getHost(dom);
    const toolbarEnd = dom.window.document.createElement("button");
    toolbarEnd.type = "button";

    const calendar = createCalendar(host, {
        events: [],
        initialDate: "2026-08-04",
        toolbarEnd
    });
    calendar.render();
    await waitForReady(calendar);

    const navigation = host.querySelector<HTMLElement>(".lfc-calendar-navigation");
    assert.ok(navigation);
    assert.equal(navigation.children.length, 3);
    assert.ok(navigation.children[0]?.classList.contains("lfc-calendar-month-stepper") ?? false);
    assert.ok(navigation.children[1]?.classList.contains("lfc-calendar-title") ?? false);
    assert.ok(navigation.children[2]?.classList.contains("lfc-calendar-today-button") ?? false);

    const stepperButtons = navigation.querySelectorAll<HTMLButtonElement>(
        ":scope > .lfc-calendar-month-stepper > button"
    );
    assert.equal(stepperButtons.length, 2);
    assert.ok(stepperButtons[0]?.classList.contains("lfc-calendar-nav-button-previous") ?? false);
    assert.ok(stepperButtons[1]?.classList.contains("lfc-calendar-nav-button-next") ?? false);

    const focusStops = Array.from(host.querySelectorAll<HTMLElement>(
        ".lfc-calendar-nav-button-previous, " +
        ".lfc-calendar-nav-button-next, " +
        ".lfc-calendar-title-button, " +
        ".lfc-calendar-today-button, " +
        ".lfc-calendar-toolbar-end > button"
    ));
    assert.equal(focusStops.length, 5);
    assert.deepEqual(focusStops, [
        stepperButtons[0],
        stepperButtons[1],
        navigation.querySelector(".lfc-calendar-title-button"),
        navigation.querySelector(".lfc-calendar-today-button"),
        toolbarEnd
    ]);
});

async function waitForReady(calendar: Calendar): Promise<void> {
    await waitFor(() => calendar.getState().phase === "ready", "ready calendar state");
}
