const CHANNEL_LABELS = Object.freeze({
	local: "Local working copy",
	main: "Rolling main preview",
	release: "Immutable release"
});
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATH_PATTERN = /^(?:[0-9A-Za-z._-]+\/)*[0-9A-Za-z._-]+$/u;
const REPOSITORY_URL = "https://github.com/tryagaindev/litefold-calendar";

function requireElement(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLElement)) {
		throw new Error(`Missing examples landing element: ${selector}`);
	}
	return element;
}

function parseMetadata(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Examples metadata must be an object.");
	}
	const { channel, commit, version } = value;
	if (typeof channel !== "string" || !Object.hasOwn(CHANNEL_LABELS, channel)) {
		throw new Error("Examples metadata has an unknown channel.");
	}
	if (typeof version !== "string" || version.length === 0) {
		throw new Error("Examples metadata has no version.");
	}
	if (commit !== null && (typeof commit !== "string" || !FULL_COMMIT_PATTERN.test(commit))) {
		throw new Error("Examples metadata has an invalid source commit.");
	}
	if (channel !== "local" && commit === null) {
		throw new Error("Deployed examples metadata has no source commit.");
	}
	return { channel, commit, version };
}

function pinRepositoryLinks(commit) {
	for (const element of document.querySelectorAll("[data-my-repository-path]")) {
		if (!(element instanceof HTMLElement) || element.localName !== "a") {
			throw new Error("Example repository links must be anchors.");
		}
		const kind = element.dataset["myRepositoryKind"];
		const path = element.dataset["myRepositoryPath"];
		if ((kind !== "blob" && kind !== "tree") ||
			typeof path !== "string" || !REPOSITORY_PATH_PATTERN.test(path)) {
			throw new Error("Example repository link metadata is invalid.");
		}
		element.setAttribute("href", `${REPOSITORY_URL}/${kind}/${commit}/${path}`);
	}
}

const metadataRoot = requireElement("[data-my-metadata-state]");
const versionElement = requireElement("[data-my-version]");
const commitElement = requireElement("[data-my-commit]");
const commitLink = requireElement("[data-my-commit-link]");
const channelElement = requireElement("[data-my-channel]");
const statusElement = requireElement("[data-my-metadata-status]");

try {
	const response = await fetch("./metadata.json", {
		cache: "no-store",
		credentials: "same-origin",
		headers: { Accept: "application/json" }
	});
	if (!response.ok) {
		throw new Error(`Metadata request failed with status ${String(response.status)}.`);
	}
	const metadata = parseMetadata(await response.json());
	versionElement.textContent = metadata.version;
	commitElement.textContent = metadata.commit ?? "Not available";
	channelElement.textContent = CHANNEL_LABELS[metadata.channel];
	if (metadata.commit === null) {
		commitLink.setAttribute("href", `${REPOSITORY_URL}/tree/main`);
		statusElement.textContent = "Local metadata loaded. Source links target the main branch.";
	} else {
		commitLink.setAttribute("href", `${REPOSITORY_URL}/commit/${metadata.commit}`);
		pinRepositoryLinks(metadata.commit);
		statusElement.textContent = "Source and documentation links are pinned to this build.";
	}
	metadataRoot.dataset["myMetadataState"] = "ready";
} catch {
	versionElement.textContent = "@alpha";
	commitElement.textContent = "main branch";
	commitLink.setAttribute("href", `${REPOSITORY_URL}/tree/main`);
	channelElement.textContent = "Metadata unavailable";
	statusElement.textContent = "Run npm run build for exact provenance. Source links still target the main branch.";
	metadataRoot.dataset["myMetadataState"] = "error";
}
