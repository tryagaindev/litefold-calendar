/** Creates the built-in decorative stacked-card cue for a day with multiple events. */
export function createMultipleEventIndicator(document: Document): SVGSVGElement {
	const namespace = "http://www.w3.org/2000/svg";
	const indicator = document.createElementNS(namespace, "svg");
	indicator.classList.add("lfc-calendar-multiple-event-indicator-icon");
	indicator.setAttribute("aria-hidden", "true");
	indicator.setAttribute("focusable", "false");
	indicator.setAttribute("viewBox", "0 0 12 12");

	const back = document.createElementNS(namespace, "rect");
	back.classList.add("lfc-calendar-multiple-event-indicator-card");
	back.setAttribute("x", "1");
	back.setAttribute("y", "1");
	back.setAttribute("width", "7");
	back.setAttribute("height", "8");
	back.setAttribute("rx", "1.25");

	const front = document.createElementNS(namespace, "rect");
	front.classList.add("lfc-calendar-multiple-event-indicator-card");
	front.setAttribute("x", "4");
	front.setAttribute("y", "3");
	front.setAttribute("width", "7");
	front.setAttribute("height", "8");
	front.setAttribute("rx", "1.25");

	indicator.append(back, front);
	return indicator;
}
