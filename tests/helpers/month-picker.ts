import assert from "node:assert/strict";

interface MonthYearPicker {
	readonly cancel: HTMLButtonElement;
	readonly heading: HTMLHeadingElement;
	readonly jump: HTMLButtonElement;
	readonly month: HTMLSelectElement;
	readonly popover: HTMLElement;
	readonly trigger: HTMLButtonElement;
	readonly year: HTMLInputElement;
}

interface MonthYearPickerLabels {
	readonly cancel: string;
	readonly jump: string;
	readonly month: string;
	readonly year: string;
}

export function getMonthYearPicker(
	host: HTMLElement,
	labels: MonthYearPickerLabels = {
		cancel: "Cancel",
		jump: "Jump",
		month: "Month",
		year: "Year"
	}
): MonthYearPicker {
	const heading = host.querySelector<HTMLHeadingElement>(".lfc-calendar-title");
	const trigger = heading?.querySelector<HTMLButtonElement>("button");
	const popover = host.querySelector<HTMLElement>('[popover="auto"][role="dialog"]');
	const month = popover?.querySelector<HTMLSelectElement>("select");
	const year = popover?.querySelector<HTMLInputElement>('input[type="number"]');
	assert.ok(heading, "Expected the calendar month heading to exist.");
	assert.ok(trigger, "Expected the month heading to contain a native button.");
	assert.ok(popover, "Expected the automatic month-and-year popover to exist.");
	assert.ok(month, "Expected the month chooser to use a native select.");
	assert.ok(year, "Expected the year chooser to use a numeric input.");
	assert.equal(getControlLabel(popover, month), labels.month);
	assert.equal(getControlLabel(popover, year), labels.year);
	const buttons = [...popover.querySelectorAll<HTMLButtonElement>("button")];
	const jump = buttons.find((button) => button.textContent?.trim() === labels.jump);
	const cancel = buttons.find((button) => button.textContent?.trim() === labels.cancel);
	assert.ok(jump, `Expected a ${labels.jump} button in the month-and-year popover.`);
	assert.ok(cancel, `Expected a ${labels.cancel} button in the month-and-year popover.`);
	return { cancel, heading, jump, month, popover, trigger, year };
}

function getControlLabel(root: HTMLElement, control: HTMLElement): string {
	const label = [...root.querySelectorAll<HTMLLabelElement>("label")]
		.find((candidate) => candidate.htmlFor === control.id || candidate.contains(control));
	assert.ok(label, `Expected a label for ${control.localName}.`);
	return label.querySelector(":scope > span")?.textContent?.trim() ?? label.textContent?.trim() ?? "";
}
