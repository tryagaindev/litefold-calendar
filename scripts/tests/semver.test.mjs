import assert from "node:assert/strict";
import test from "node:test";

import {
	compareSemVer,
	compareSemVerPrecedence,
	isAlphaVersion,
	nextAlphaVersion,
	parseSemVer
} from "../lib/semver.mjs";

void test("SemVer precedence follows the specification", () => {
	const ordered = [
		"1.0.0-alpha",
		"1.0.0-alpha.1",
		"1.0.0-alpha.beta",
		"1.0.0-beta",
		"1.0.0-beta.2",
		"1.0.0-beta.11",
		"1.0.0-rc.1",
		"1.0.0"
	];
	for (let index = 1; index < ordered.length; index += 1) {
		assert.equal(compareSemVerPrecedence(ordered[index - 1], ordered[index]), -1);
		assert.equal(compareSemVerPrecedence(ordered[index], ordered[index - 1]), 1);
	}
});

void test("SemVer comparison uses deterministic build ties", () => {
	assert.equal(compareSemVerPrecedence("1.0.0+build.1", "1.0.0+build.2"), 0);
	assert.equal(compareSemVer("1.0.0+build.1", "1.0.0+build.2"), -1);
});

void test("SemVer parser rejects leading zeroes and malformed identifiers", () => {
	for (const value of ["01.0.0", "1.0", "1.0.0-alpha.01", "1.0.0+bad_value", "v1.0.0"]) {
		assert.throws(() => parseSemVer(value), /Invalid Semantic Version/u);
	}
});

void test("alpha bump choices calculate the intended next version", () => {
	assert.equal(nextAlphaVersion("0.2.0-alpha.9", "prerelease"), "0.2.0-alpha.10");
	assert.equal(nextAlphaVersion("0.2.0-alpha.9", "prepatch"), "0.2.1-alpha.0");
	assert.equal(nextAlphaVersion("0.2.0-alpha.9", "preminor"), "0.3.0-alpha.0");
	assert.equal(isAlphaVersion("0.2.0-alpha.0"), true);
	assert.equal(isAlphaVersion("0.2.0-alpha.0+rebuilt"), false);
	assert.equal(isAlphaVersion("1.0.0-alpha.0"), false);
	assert.throws(() => nextAlphaVersion("0.2.0-alpha.0", "major"), /Unsupported alpha version bump/u);
});
