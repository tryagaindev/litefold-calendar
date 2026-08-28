const PACKAGE_NAME = "@tryagaindev/litefold-calendar";
const REPOSITORY_URL = "https://github.com/tryagaindev/litefold-calendar";
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

function validateEntry(value, expectedChannel) {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		value.channel !== expectedChannel ||
		typeof value.version !== "string" ||
		!SEMVER_PATTERN.test(value.version) ||
		typeof value.commit !== "string" ||
		!COMMIT_PATTERN.test(value.commit) ||
		typeof value.path !== "string"
	) {
		throw new Error(`Invalid ${expectedChannel} deployment metadata.`);
	}

	const expectedPath = expectedChannel === "main"
		? "main/examples/"
		: `releases/${value.version}/examples/`;
	if (value.path !== expectedPath) {
		throw new Error(`Invalid ${expectedChannel} deployment path.`);
	}
	return Object.freeze({
		channel: value.channel,
		commit: value.commit,
		path: value.path,
		version: value.version
	});
}

export function validateManifest(value) {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		value.schemaVersion !== 1 ||
		!Array.isArray(value.releases)
	) {
		throw new Error("Invalid deployment manifest.");
	}

	const main = value.main === null ? null : validateEntry(value.main, "main");
	const releases = value.releases.map((entry) => validateEntry(entry, "release"));
	const versions = new Set();
	for (const release of releases) {
		if (versions.has(release.version)) {
			throw new Error(`Duplicate release deployment ${release.version}.`);
		}
		versions.add(release.version);
	}
	return Object.freeze({ main, releases: Object.freeze(releases) });
}

export function selectPrimaryDeployment(manifest) {
	return manifest.releases[0] ?? manifest.main;
}

function sourceUrl(commit, path) {
	return `${REPOSITORY_URL}/blob/${commit}/${path}`;
}

function examplesSourceUrl(commit, path = "examples") {
	return `${REPOSITORY_URL}/tree/${commit}/${path}`;
}

function setLink(documentReference, id, href) {
	const link = documentReference.querySelector(`#${id}`);
	if (link?.tagName === "A") {
		link.href = href;
	}
}

function setText(documentReference, id, value) {
	const element = documentReference.querySelector(`#${id}`);
	if (element !== null) {
		element.textContent = value;
	}
}

function createLink(documentReference, label, href) {
	const link = documentReference.createElement("a");
	link.href = href;
	link.textContent = label;
	return link;
}

function createReleaseCard(documentReference, entry) {
	const item = documentReference.createElement("li");
	item.className = "lfc-pages-deployment-card";

	const heading = documentReference.createElement("h3");
	heading.textContent = entry.version;

	const details = documentReference.createElement("dl");
	for (const [term, description] of [
		["Channel", "Immutable release"],
		["Source", entry.commit]
	]) {
		const termElement = documentReference.createElement("dt");
		termElement.textContent = term;
		const descriptionElement = documentReference.createElement("dd");
		const code = documentReference.createElement("code");
		code.textContent = description;
		descriptionElement.append(code);
		details.append(termElement, descriptionElement);
	}

	const links = documentReference.createElement("p");
	links.className = "lfc-pages-inline-links";
	links.append(
		createLink(documentReference, `Run ${entry.version} basic example`, `./${entry.path}basic/`),
		createLink(documentReference, `Browse ${entry.version} examples`, `./${entry.path}`),
		createLink(documentReference, `View ${entry.version} source`, examplesSourceUrl(entry.commit))
	);
	item.append(heading, details, links);
	return item;
}

function renderReleaseHistory(documentReference, releases) {
	const container = documentReference.querySelector("#release-history");
	if (container === null) {
		throw new Error("Release history container was not found.");
	}
	if (releases.length === 0) {
		const paragraph = documentReference.createElement("p");
		paragraph.append(
			"No immutable release demos are available yet. ",
			createLink(documentReference, "Browse GitHub releases", `${REPOSITORY_URL}/releases`),
			"."
		);
		container.replaceChildren(paragraph);
		return;
	}

	const list = documentReference.createElement("ol");
	list.className = "lfc-pages-deployment-list";
	list.setAttribute("role", "list");
	for (const release of releases) {
		list.append(createReleaseCard(documentReference, release));
	}
	container.replaceChildren(list);
}

function renderMainPreview(documentReference, entry) {
	const container = documentReference.querySelector("#main-preview");
	if (container === null) {
		throw new Error("Main preview container was not found.");
	}
	if (entry === null) {
		const paragraph = documentReference.createElement("p");
		paragraph.append(
			"The rolling preview is not available. ",
			createLink(documentReference, "Browse the source on GitHub", `${REPOSITORY_URL}/tree/main/examples`),
			"."
		);
		container.replaceChildren(paragraph);
		return;
	}

	const description = documentReference.createElement("p");
	description.textContent = `Version ${entry.version} from commit ${entry.commit}.`;
	const links = documentReference.createElement("p");
	links.className = "lfc-pages-inline-links";
	const previewLink = createLink(documentReference, "Browse main examples", `./${entry.path}`);
	previewLink.id = "main-preview-link";
	const sourceLink = createLink(documentReference, "View source", examplesSourceUrl(entry.commit));
	sourceLink.id = "main-preview-source-link";
	links.append(previewLink, sourceLink);
	container.replaceChildren(description, links);
}

function renderPrimaryDeployment(documentReference, entry) {
	setLink(documentReference, "primary-run-link", `./${entry.path}basic/`);
	setLink(documentReference, "primary-browse-link", `./${entry.path}`);
	setText(documentReference, "primary-run-link", "Run basic example");
	setText(documentReference, "primary-browse-link", "Browse all examples");
	setLink(documentReference, "primary-source-link", examplesSourceUrl(entry.commit, "examples/basic"));
	setLink(documentReference, "api-link", sourceUrl(entry.commit, "docs/api.md"));
	setLink(documentReference, "integration-link", sourceUrl(entry.commit, "docs/integration-guide.md"));
	setLink(documentReference, "quick-start-link", sourceUrl(entry.commit, "README.md#quick-start"));
	setText(documentReference, "selected-version", entry.version);
	setText(documentReference, "selected-channel", entry.channel === "release"
		? "Immutable release"
		: "Rolling main preview");

	const commitLink = documentReference.querySelector("#selected-commit");
	if (commitLink?.tagName === "A") {
		commitLink.href = `${REPOSITORY_URL}/commit/${entry.commit}`;
		const code = commitLink.querySelector("code");
		if (code !== null) {
			code.textContent = entry.commit;
		}
	}

	const isRelease = entry.channel === "release";
	setText(documentReference, "install-command",
		`npm install ${PACKAGE_NAME}@${isRelease ? entry.version : "alpha"}`);
	setText(documentReference, "deployment-summary", isRelease
		? `Running immutable release ${entry.version}. Source links are pinned to its commit.`
		: `Running main at ${entry.commit}. The install command follows npm's alpha dist-tag.`);
}

function renderUnavailablePrimary(documentReference) {
	const basicSource = examplesSourceUrl("main", "examples/basic");
	const examplesSource = examplesSourceUrl("main");
	const runLink = documentReference.querySelector("#primary-run-link");
	const browseLink = documentReference.querySelector("#primary-browse-link");
	if (runLink?.tagName === "A") {
		runLink.href = basicSource;
		runLink.textContent = "Browse basic source";
	}
	if (browseLink?.tagName === "A") {
		browseLink.href = examplesSource;
		browseLink.textContent = "Browse examples source";
	}
	setText(documentReference, "deployment-summary",
		"No deployed build is listed yet. Repository and documentation links remain available.");
}

function announceCopyStatus(documentReference, message) {
	const status = documentReference.querySelector("#copy-status");
	if (status !== null) {
		status.textContent = "";
		status.textContent = message;
	}
}

export async function copyCode(
	button,
	documentReference = globalThis.document,
	navigatorReference = globalThis.navigator
) {
	const targetId = button.getAttribute("data-copy-target");
	const label = button.getAttribute("data-copy-label") ?? "Code";
	const target = targetId === null ? null : documentReference.getElementById(targetId);
	if (target === null) {
		announceCopyStatus(documentReference, `${label} is unavailable.`);
		return "unavailable";
	}

	const value = target.textContent?.trim() ?? "";
	try {
		if (typeof navigatorReference?.clipboard?.writeText !== "function") {
			throw new Error("Clipboard API is unavailable.");
		}
		await navigatorReference.clipboard.writeText(value);
		announceCopyStatus(documentReference, `${label} copied.`);
		return "copied";
	} catch {
		const selection = documentReference.defaultView?.getSelection();
		if (selection === undefined || selection === null) {
			announceCopyStatus(documentReference, `${label} could not be copied.`);
			return "unavailable";
		}
		const range = documentReference.createRange();
		range.selectNodeContents(target);
		selection.removeAllRanges();
		selection.addRange(range);
		announceCopyStatus(documentReference, `${label} selected. Press Ctrl+C or Command+C to copy.`);
		return "selected";
	}
}

export function renderDeploymentManifest(documentReference, value) {
	const manifest = validateManifest(value);
	const primary = selectPrimaryDeployment(manifest);
	if (primary !== null) {
		renderPrimaryDeployment(documentReference, primary);
	} else {
		renderUnavailablePrimary(documentReference);
	}
	renderReleaseHistory(documentReference, manifest.releases);
	renderMainPreview(documentReference, manifest.main);
}

export async function renderDeployments(documentReference = globalThis.document, fetchReference = globalThis.fetch) {
	const response = await fetchReference("./site-manifest.json", {
		cache: "no-store",
		credentials: "same-origin"
	});
	if (!response.ok) {
		throw new Error(`Deployment metadata request failed with ${String(response.status)}.`);
	}

	renderDeploymentManifest(documentReference, await response.json());
}

export function initializePage(documentReference = globalThis.document) {
	for (const button of documentReference.querySelectorAll("[data-copy-target]")) {
		button.addEventListener("click", () => {
			void copyCode(button, documentReference);
		});
	}

	void renderDeployments(documentReference).catch((error) => {
		console.warn("Litefold Calendar deployment metadata is unavailable.", error);
	});
}

if (typeof document !== "undefined") {
	initializePage(document);
}
