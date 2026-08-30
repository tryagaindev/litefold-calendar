import assert from "node:assert/strict";

export async function waitFor(predicate, description, maximumAttempts = 200) {
	for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	assert.fail(`Timed out waiting for ${description}.`);
}

export function requireElement(root, selector, constructor) {
	const element = root.querySelector(selector);
	assert.ok(element instanceof constructor, `Expected ${selector}.`);
	return element;
}

export function findAgendaAction(root, eventId) {
	return [...root.querySelectorAll('[data-test-event-surface="agenda"]')]
		.find((action) => action.getAttribute("data-test-event-id") === eventId) ?? null;
}

export function requireAgendaAction(root, eventId) {
	const action = findAgendaAction(root, eventId);
	assert.ok(
		action instanceof root.ownerDocument.defaultView.HTMLButtonElement ||
			action instanceof root.ownerDocument.defaultView.HTMLAnchorElement,
		`Expected an agenda action for ${eventId}.`
	);
	return action;
}

export function getAgendaActions(root) {
	return [...root.querySelectorAll('[data-test-event-surface="agenda"]')];
}

export function findAgendaMoreButton(agenda) {
	return [...agenda.querySelectorAll("button")]
		.find((button) => !button.hasAttribute("data-test-event-id")) ?? null;
}

export function requireSelectedDay(root) {
	const cell = requireElement(
		root,
		'[role="gridcell"][aria-selected="true"]',
		root.ownerDocument.defaultView.HTMLElement
	);
	const button = requireElement(cell, "button", root.ownerDocument.defaultView.HTMLButtonElement);
	return { button, cell };
}

export function clickCommand(document, name) {
	const button = requireElement(
		document,
		`[data-my-command="${name}"]`,
		document.defaultView.HTMLButtonElement
	);
	button.click();
}
