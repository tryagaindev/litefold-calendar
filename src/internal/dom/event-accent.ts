/** Creates the built-in decorative accent used by event representations. */
export function createEventAccent(document: Document, accentColor: string | null): SVGSVGElement {
	const namespace = "http://www.w3.org/2000/svg";
	const marker = document.createElementNS(namespace, "svg");
	marker.classList.add("lfc-calendar-event-accent");
	marker.setAttribute("aria-hidden", "true");
	marker.setAttribute("focusable", "false");
	marker.setAttribute("viewBox", "0 0 8 8");
	const shape = document.createElementNS(namespace, "circle");
	shape.classList.add("lfc-calendar-event-accent-shape");
	shape.setAttribute("cx", "4");
	shape.setAttribute("cy", "4");
	shape.setAttribute("r", "4");
	if (accentColor === null) {
		marker.classList.add("lfc-uses-token");
	} else {
		shape.setAttribute("fill", accentColor);
	}
	marker.append(shape);
	return marker;
}
