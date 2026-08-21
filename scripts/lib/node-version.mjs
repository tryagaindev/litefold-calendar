export const SUPPORTED_NODE_MAJOR = 24;
export const SUPPORTED_NODE_RANGE = `${String(SUPPORTED_NODE_MAJOR)}.x`;
export const SUPPORTED_NODE_SELECTOR = String(SUPPORTED_NODE_MAJOR);

const EXACT_NODE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function parseNodeVersion(version) {
	if (typeof version !== "string") {
		return undefined;
	}
	const match = EXACT_NODE_VERSION.exec(version);
	if (match === null) {
		return undefined;
	}
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
		return undefined;
	}
	return Object.freeze({ major, minor, patch });
}

export function isSupportedNodeVersion(version) {
	return parseNodeVersion(version)?.major === SUPPORTED_NODE_MAJOR;
}

export function assertSupportedNodeVersion(context, version = process.versions.node) {
	if (!isSupportedNodeVersion(version)) {
		throw new Error(`${context} requires Node ${SUPPORTED_NODE_RANGE}; running ${String(version)}.`);
	}
}
