const CHANNELS = new Set(["local", "main", "release"]);
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z.+-]{0,126}[0-9A-Za-z])?$/u;

function requireMetadataRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Example metadata must be a JSON object.");
	}
	return value;
}

export function createExampleMetadata({ channel, commit, version }) {
	if (typeof channel !== "string" || !CHANNELS.has(channel)) {
		throw new Error("Example metadata channel must be local, main, or release.");
	}
	if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
		throw new Error("Example metadata version must be a compact package-version identifier.");
	}
	if (commit !== null && (typeof commit !== "string" || !FULL_COMMIT_PATTERN.test(commit))) {
		throw new Error("Example metadata commit must be null or a full lowercase Git SHA.");
	}
	if (channel !== "local" && commit === null) {
		throw new Error("Deployed example metadata requires a full lowercase Git SHA.");
	}

	return Object.freeze({ channel, commit, version });
}

export function parseExampleMetadata(value) {
	const record = requireMetadataRecord(value);
	const keys = Object.keys(record).sort();
	if (keys.join(",") !== "channel,commit,version") {
		throw new Error("Example metadata must contain exactly channel, commit, and version.");
	}
	return createExampleMetadata({
		channel: record.channel,
		commit: record.commit,
		version: record.version
	});
}

export function serializeExampleMetadata(metadata) {
	const verified = parseExampleMetadata(metadata);
	return `${JSON.stringify({
		version: verified.version,
		commit: verified.commit,
		channel: verified.channel
	}, null, "\t")}\n`;
}
