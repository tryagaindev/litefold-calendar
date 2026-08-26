/** Creates agenda list and footer content without mutating the stable agenda shell. */
export function createAgendaPresentation(input) {
    if (!input.hasSnapshot) {
        return freezePresentation(input.titleText, true, [], [], [], null);
    }
    if (input.totalEventCount === 0) {
        const empty = input.document.createElement("p");
        empty.className = "lfc-calendar-agenda-empty";
        empty.textContent = input.emptyText;
        return freezePresentation(input.titleText, true, [], [empty], [], null);
    }
    const listItems = [];
    const actionReferences = [];
    for (const entry of input.entries) {
        const item = input.document.createElement("li");
        item.className = "lfc-calendar-agenda-item";
        item.append(entry.root);
        listItems.push(item);
        if (entry.action !== null) {
            actionReferences.push(Object.freeze({ action: entry.action, eventId: entry.eventId }));
        }
    }
    const footerChildren = [];
    let moreButton = null;
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
    return freezePresentation(input.titleText, false, listItems, footerChildren, actionReferences, moreButton);
}
function freezePresentation(titleText, listHidden, listItems, footerChildren, actionReferences, moreButton) {
    return Object.freeze({
        actionReferences: Object.freeze(actionReferences),
        footerChildren: Object.freeze(footerChildren),
        listHidden,
        listItems: Object.freeze(listItems),
        moreButton,
        titleText
    });
}
//# sourceMappingURL=agenda.js.map