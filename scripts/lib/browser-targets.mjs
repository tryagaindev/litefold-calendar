import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { resolveConfig } from "vite";

import { REPOSITORY_ROOT } from "./process.mjs";

const require = createRequire(import.meta.url);
export const BROWSER_TARGET_PRESET = "baseline-widely-available";

//Use Vite's public resolver, avoiding copied browser versions or private constants.
const presetConfiguration = await resolveConfig({
	configFile: false,
	envFile: false,
	logLevel: "silent",
	root: REPOSITORY_ROOT,
	build: { target: BROWSER_TARGET_PRESET }
}, "build");

function packageVersion(name) {
	let directory = dirname(require.resolve(name));
	for (;;) {
		try {
			const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
			if (manifest.name === name) { return manifest.version; }
		} catch (error) {
			if (error.code !== "ENOENT") { throw error; }
		}
		const parent = dirname(directory);
		if (parent === directory) { throw new Error(`Cannot resolve ${name} package version.`); }
		directory = parent;
	}
}

/** Validates the UTC resolution date retained with one build's target evidence. */
export function normalizeBrowserTargetDate(date) {
	if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
		!Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ||
		new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
		throw new TypeError("Browser target date must be a valid YYYY-MM-DD UTC date.");
	}
	return date;
}

function resolvedTargets(value) {
	if (!Array.isArray(value) || value.length === 0 ||
		value.some((target) => typeof target !== "string" || !/^[a-z]+\d+(?:\.\d+)*$/u.test(target))) {
		throw new Error("Vite did not resolve the Baseline preset to explicit browser targets.");
	}
	return Object.freeze([...value]);
}

/** Reports the installed Vite preset; the date records resolution, not a moving target. */
export function resolveBrowserTargets({
	date = process.env.LFC_BROWSER_TARGET_DATE ?? new Date().toISOString().slice(0, 10)
} = {}) {
	const resolvedAt = normalizeBrowserTargetDate(date);
	const dataVersions = Object.freeze({ vite: packageVersion("vite"), esbuild: packageVersion("esbuild") });
	const javascript = resolvedTargets(presetConfiguration.build.target);
	const css = resolvedTargets(presetConfiguration.build.cssTarget);
	return Object.freeze({ query: BROWSER_TARGET_PRESET,
		effectiveQuery: `Vite ${dataVersions.vite}: ${BROWSER_TARGET_PRESET}`, resolvedAt,
		dataVersions, browsers: javascript, javascript, css });
}

/** Fingerprints effective compatibility inputs without making evidence stale every midnight. */
export function browserTargetsFingerprint(targets = resolveBrowserTargets()) {
	return createHash("sha256").update(JSON.stringify({ query: targets.query,
		dataVersions: targets.dataVersions, browsers: targets.browsers,
		javascript: targets.javascript, css: targets.css })).digest("hex");
}

/** Records this build's resolution outside the directory reserved for release bundles. */
export async function writeBrowserTargetReport(targets = resolveBrowserTargets(),
	path = join(REPOSITORY_ROOT, ".cache", "browser-targets.json")) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(targets, null, 2)}\n`);
	return targets;
}