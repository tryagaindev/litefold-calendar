const CHANNEL_LABELS = Object.freeze({
	local: "Local working copy",
	main: "Rolling main preview",
	release: "Immutable release"
});
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

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

const metadataRoot = requireElement("[data-example-metadata-state]");
const versionElement = requireElement("[data-example-version]");
const commitElement = requireElement("[data-example-commit]");
const channelElement = requireElement("[data-example-channel]");
const statusElement = requireElement("[data-example-metadata-status]");

try {
	const response = await fetch("./metadata.json", {
		headers: { Accept: "application/json" }
	});
	if (!response.ok) {
		throw new Error(`Metadata request failed with status ${String(response.status)}.`);
	}
	const metadata = parseMetadata(await response.json());
	versionElement.textContent = metadata.version;
	commitElement.textContent = metadata.commit ?? "Not available";
	channelElement.textContent = CHANNEL_LABELS[metadata.channel];
	statusElement.textContent = "Generated build metadata loaded.";
	metadataRoot.dataset["exampleMetadataState"] = "ready";
} catch {
	versionElement.textContent = "Unavailable";
	commitElement.textContent = "Unavailable";
	channelElement.textContent = "Unavailable";
	statusElement.textContent = "Build identity is unavailable. Run npm run build before serving the examples.";
	metadataRoot.dataset["exampleMetadataState"] = "error";
}
