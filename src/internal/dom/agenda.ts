import type { CalendarEventActionElement } from "../../types.js";

/** One bounded event representation supplied to the agenda presenter. */
export interface AgendaEventEntry {
	readonly action: CalendarEventActionElement | null;
	readonly eventId: string;
	readonly root: HTMLElement;
}

/** Immutable display values for one detached agenda presentation. */
export interface AgendaPresentationInput {
	readonly document: Document;
	readonly emptyText: string;
	readonly entries: readonly Readonly<AgendaEventEntry>[];
	readonly hasSnapshot: boolean;
	readonly moreText: string | null;
	readonly progressText: string | null;
	readonly titleText: string;
	readonly totalEventCount: number;
}

/** Action reference returned without granting the presenter access to runtime maps. */
export interface AgendaActionReference {
	readonly action: CalendarEventActionElement;
	readonly eventId: string;
}

/** Detached agenda nodes and metadata awaiting a coordinator-owned commit. */
export interface AgendaPresentation {
	readonly actionReferences: readonly Readonly<AgendaActionReference>[];
	readonly footerChildren: readonly HTMLElement[];
	readonly listHidden: boolean;
	readonly listItems: readonly HTMLLIElement[];
	readonly moreButton: HTMLButtonElement | null;
	readonly titleText: string;
}

/** Creates agenda list and footer content without mutating the stable agenda shell. */
export function createAgendaPresentation(
	input: Readonly<AgendaPresentationInput>
): Readonly<AgendaPresentation> {
	if (!input.hasSnapshot) {
		return freezePresentation(input.titleText, true, [], [], [], null);
	}
	if (input.totalEventCount === 0) {
		const empty = input.document.createElement("p");
		empty.className = "lfc-calendar-agenda-empty";
		empty.textContent = input.emptyText;
		return freezePresentation(input.titleText, true, [], [empty], [], null);
	}

	const listItems: HTMLLIElement[] = [];
	const actionReferences: Readonly<AgendaActionReference>[] = [];
	for (const entry of input.entries) {
		const item = input.document.createElement("li");
		item.className = "lfc-calendar-agenda-item";
		item.append(entry.root);
		listItems.push(item);
		if (entry.action !== null) {
			actionReferences.push(Object.freeze({ action: entry.action, eventId: entry.eventId }));
		}
	}

	const footerChildren: HTMLElement[] = [];
	let moreButton: HTMLButtonElement | null = null;
	if (input.moreText !== null) {
		moreButton = input.document.createElement("button");
		moreButton.className = "lfc-calendar-agenda-more";
		moreButton.type = "button";
		moreButton.textContent = input.moreText;
		footerChildren.push(moreButton);
	}
	if (input.progressText !== null) {
		const progress = input.document.createElement("p");
		progress.className = "lfc-calendar-agenda-overflow";
		progress.textContent = input.progressText;
		footerChildren.push(progress);
	}

	return freezePresentation(
		input.titleText,
		false,
		listItems,
		footerChildren,
		actionReferences,
		moreButton
	);
}

function freezePresentation(
	titleText: string,
	listHidden: boolean,
	listItems: HTMLLIElement[],
	footerChildren: HTMLElement[],
	actionReferences: Readonly<AgendaActionReference>[],
	moreButton: HTMLButtonElement | null
): Readonly<AgendaPresentation> {
	return Object.freeze({
		actionReferences: Object.freeze(actionReferences),
		footerChildren: Object.freeze(footerChildren),
		listHidden,
		listItems: Object.freeze(listItems),
		moreButton,
		titleText
	});
}
