/** Creates the built-in decorative event-slip fan for a day with multiple events. */
export function createMultipleEventIndicator(document: Document): SVGSVGElement {
	const namespace = "http://www.w3.org/2000/svg";
	const indicator = document.createElementNS(namespace, "svg");
	indicator.classList.add("lfc-calendar-multiple-event-indicator-icon");
	indicator.setAttribute("aria-hidden", "true");
	indicator.setAttribute("focusable", "false");
	indicator.setAttribute("viewBox", "0 0 16 14");

	const back = document.createElementNS(namespace, "rect");
	back.classList.add("lfc-calendar-multiple-event-indicator-card");
	back.setAttribute("x", "1");
	back.setAttribute("y", "1");
	back.setAttribute("width", "11");
	back.setAttribute("height", "5");
	back.setAttribute("rx", "1.25");

	const middle = document.createElementNS(namespace, "rect");
	middle.classList.add("lfc-calendar-multiple-event-indicator-card");
	middle.setAttribute("x", "2.5");
	middle.setAttribute("y", "4.5");
	middle.setAttribute("width", "11.5");
	middle.setAttribute("height", "5");
	middle.setAttribute("rx", "1.25");

	const front = document.createElementNS(namespace, "rect");
	front.classList.add("lfc-calendar-multiple-event-indicator-card");
	front.setAttribute("x", "4");
	front.setAttribute("y", "8");
	front.setAttribute("width", "11");
	front.setAttribute("height", "5");
	front.setAttribute("rx", "1.25");

	indicator.append(back, middle, front);
	return indicator;
}
