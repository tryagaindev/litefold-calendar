const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const PATH_PATTERNS = Object.freeze({
	main: /^main\/examples\/$/u,
	release: /^releases\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\/examples\/$/u
});

function validateEntry(value, expectedChannel) {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		value.channel !== expectedChannel ||
		typeof value.version !== "string" ||
		!VERSION_PATTERN.test(value.version) ||
		typeof value.commit !== "string" ||
		!COMMIT_PATTERN.test(value.commit) ||
		typeof value.path !== "string" ||
		!PATH_PATTERNS[expectedChannel].test(value.path)
	) {
		throw new Error(`Invalid ${expectedChannel} deployment metadata.`);
	}
	return value;
}

function createDeploymentCard(entry, label) {
	const item = document.createElement("li");
	item.className = "lfc-pages-deployment-card";
	const heading = document.createElement("h3");
	const link = document.createElement("a");
	link.href = `./${entry.path}`;
	link.textContent = label;
	heading.append(link);
	const details = document.createElement("dl");
	for (const [term, description] of [
		["Package version", entry.version],
		["Source commit", entry.commit],
		["Deployment channel", entry.channel === "main" ? "Rolling main preview" : "Immutable release"]
	]) {
		const termElement = document.createElement("dt");
		termElement.textContent = term;
		const descriptionElement = document.createElement("dd");
		const code = document.createElement("code");
		code.textContent = description;
		descriptionElement.append(code);
		details.append(termElement, descriptionElement);
	}
	item.append(heading, details);
	return item;
}

function renderList(container, entries, labelFor) {
	const list = document.createElement("ul");
	list.className = "lfc-pages-deployment-list";
	for (const entry of entries) {
		list.append(createDeploymentCard(entry, labelFor(entry)));
	}
	container.replaceChildren(list);
}

async function renderDeployments() {
	const response = await fetch("./site-manifest.json", {
		cache: "no-store",
		credentials: "same-origin"
	});
	if (!response.ok) {
		throw new Error(`Deployment metadata request failed with ${String(response.status)}.`);
	}
	const manifest = await response.json();
	if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.releases)) {
		throw new Error("Invalid deployment manifest.");
	}

	const mainContainer = document.querySelector("#main-preview");
	const releasesContainer = document.querySelector("#release-demos");
	if (!(mainContainer instanceof HTMLElement) || !(releasesContainer instanceof HTMLElement)) {
		throw new Error("Deployment index containers were not found.");
	}
	if (manifest.main === null) {
		mainContainer.replaceChildren(document.createTextNode("The rolling preview has not been deployed yet."));
	} else {
		renderList(mainContainer, [validateEntry(manifest.main, "main")], () => "Open the rolling preview");
	}

	const releases = manifest.releases.map((entry) => validateEntry(entry, "release"));
	if (releases.length === 0) {
		releasesContainer.replaceChildren(document.createTextNode("No release demos have been deployed yet."));
	} else {
		renderList(releasesContainer, releases, (entry) => `Open ${entry.version}`);
	}
}

renderDeployments().catch((error) => {
	const message = error instanceof Error ? error.message : "Unknown deployment metadata failure.";
	for (const selector of ["#main-preview", "#release-demos"]) {
		const container = document.querySelector(selector);
		if (container instanceof HTMLElement) {
			container.replaceChildren(document.createTextNode(`Deployment metadata is unavailable: ${message}`));
		}
	}
});
