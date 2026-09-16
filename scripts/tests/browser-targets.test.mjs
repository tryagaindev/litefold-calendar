import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfig } from "vite";

import { BROWSER_TARGET_PRESET, browserTargetsFingerprint, normalizeBrowserTargetDate,
	resolveBrowserTargets } from "../lib/browser-targets.mjs";

void test("browser target date rejects normalized invalid dates and timestamps", () => {
	assert.equal(normalizeBrowserTargetDate("2024-02-29"), "2024-02-29");
	for (const value of ["2025-02-29", "2026-13-01", "2026-09-12T00:00:00Z", "", null]) {
		assert.throws(() => normalizeBrowserTargetDate(value), TypeError);
	}
});

void test("JavaScript and CSS evidence follows Vite's public preset resolution", async () => {
	const report = resolveBrowserTargets({ date: "2026-09-12" });
	const config = await resolveConfig({ configFile: false, envFile: false, logLevel: "silent",
		build: { target: BROWSER_TARGET_PRESET } }, "build");
	assert.equal(report.query, "baseline-widely-available");
	assert.equal(report.resolvedAt, "2026-09-12");
	assert.deepEqual(report.javascript, config.build.target);
	assert.deepEqual(report.css, config.build.cssTarget);
	assert.ok(report.browsers.length > 0);
	for (const name of ["vite", "esbuild"]) {
		assert.match(report.dataVersions[name], /^\d+\.\d+\.\d+$/u);
	}
	assert.ok(Object.isFrozen(report) && Object.isFrozen(report.javascript));
});

void test("a new resolution date does not change preset targets or screenshot freshness", () => {
	const report = resolveBrowserTargets({ date: "2026-09-12" });
	const later = resolveBrowserTargets({ date: "2026-09-13" });
	assert.equal(browserTargetsFingerprint(report), browserTargetsFingerprint(later));
	assert.notEqual(browserTargetsFingerprint(report), browserTargetsFingerprint({ ...report,
		javascript: [...report.javascript, "chrome999"] }));
});