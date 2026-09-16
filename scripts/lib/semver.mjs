import semver from "semver";

/** Parses a strict, normalized Semantic Version. */
export function parseSemVer(value) {
	const parsed = typeof value === "string" ? semver.parse(value) : null;
	const normalized = parsed === null
		? null
		: `${parsed.version}${parsed.build.length === 0 ? "" : `+${parsed.build.join(".")}`}`;
	if (parsed === null || normalized !== value) {
		throw new Error(`Invalid Semantic Version: ${String(value)}`);
	}
	return parsed;
}

/** Compares Semantic Version precedence while ignoring build metadata. */
export function compareSemVerPrecedence(left, right) {
	return semver.compare(parseSemVer(left).version, parseSemVer(right).version);
}

/** Compares complete Semantic Versions, including build metadata. */
export function compareSemVer(left, right) {
	parseSemVer(left);
	parseSemVer(right);
	return semver.compareBuild(left, right);
}
