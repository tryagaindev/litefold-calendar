import semver from "semver";

const ALPHA_BUMPS = new Set(["prerelease", "prepatch", "preminor"]);

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

/** Calculates the supported next public alpha version. */
export function nextAlphaVersion(value, bump) {
	parseSemVer(value);
	if (!ALPHA_BUMPS.has(bump)) {
		throw new Error(`Unsupported alpha version bump: ${String(bump)}`);
	}
	const next = semver.inc(value, bump, "alpha");
	if (next === null || !isAlphaVersion(next)) {
		throw new Error(`Unable to calculate the next alpha version from ${value}.`);
	}
	return next;
}

/** Identifies the repository's supported 0.x.y-alpha.N release shape. */
export function isAlphaVersion(value) {
	try {
		const parsed = parseSemVer(value);
		return parsed.major === 0 &&
			parsed.build.length === 0 &&
			parsed.prerelease.length === 2 &&
			parsed.prerelease[0] === "alpha" &&
			Number.isSafeInteger(parsed.prerelease[1]);
	} catch {
		return false;
	}
}
