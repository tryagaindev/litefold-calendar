import { readFile, writeFile } from "node:fs/promises";

const START_MARKER = "<!-- browser-targets:start -->";
const END_MARKER = "<!-- browser-targets:end -->";
const BROWSER_LABELS = Object.freeze({
	chrome: "Google Chrome",
	edge: "Microsoft Edge (Chromium)",
	firefox: "Mozilla Firefox",
	safari: "Safari on macOS",
	ios: "Safari on iOS / iPadOS"
});

/** Parses explicit resolver targets without inventing equivalences between browser families. */
function parseTargets(values) {
	if (!Array.isArray(values) || values.length === 0) {
		throw new TypeError("Browser documentation requires nonempty explicit target arrays.");
	}
	const targets = new Map();
	for (const value of values) {
		const match = typeof value === "string" ? /^([a-z]+)(\d+(?:\.\d+)*)$/u.exec(value) : null;
		if (match === null || !Object.hasOwn(BROWSER_LABELS, match[1])) {
			throw new TypeError("Review the browser documentation formatter for an unsupported target.");
		}
		if (targets.has(match[1])) {
			throw new TypeError("Browser documentation requires one target per browser per column.");
		}
		targets.set(match[1], match[2]);
	}
	return targets;
}

/** Generates a stable table from the same report used by builds; resolution dates do not cause churn. */
export function renderBrowserTargetDocumentation(report) {
	if (typeof report?.query !== "string" || !/^[a-z][a-z0-9-]*$/u.test(report.query)) {
		throw new TypeError("Browser documentation requires a valid preset identifier.");
	}
	for (const name of ["vite", "esbuild"]) {
		const version = report.dataVersions?.[name];
		if (typeof version !== "string" ||
			!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) {
			throw new TypeError("Browser documentation requires resolved toolchain versions.");
		}
	}
	const javascript = parseTargets(report.javascript);
	const css = parseTargets(report.css);
	const rows = Object.entries(BROWSER_LABELS)
		.filter(([browser]) => javascript.has(browser) || css.has(browser))
		.map(([browser, label]) =>
			`| ${label} | ${javascript.get(browser) ?? "—"} | ${css.get(browser) ?? "—"} |`
		);
	return [
		START_MARKER,
		"<!-- Generated from the shared browser target resolver; do not edit by hand. -->",
		`Preset: \`${report.query}\`.  Resolver: Vite \`${report.dataVersions.vite}\`; esbuild \`${report.dataVersions.esbuild}\`.`,
		"",
		"| Browser | JavaScript minimum | CSS minimum |",
		"| --- | --- | --- |",
		...rows,
		END_MARKER
	].join("\n");
}

/** Replaces exactly one marked block, preserving all surrounding documentation verbatim. */
export function replaceBrowserTargetDocumentation(source, report) {
	const start = source.indexOf(START_MARKER);
	const end = source.indexOf(END_MARKER);
	if (start === -1 || end <= start ||
		start !== source.lastIndexOf(START_MARKER) || end !== source.lastIndexOf(END_MARKER) ||
		(start !== 0 && source[start - 1] !== "\n") || source[start + START_MARKER.length] !== "\n" ||
		source[end - 1] !== "\n" ||
		(end + END_MARKER.length !== source.length && source[end + END_MARKER.length] !== "\n")) {
		throw new Error("Browser documentation must contain one ordered pair of standalone target markers.");
	}
	return source.slice(0, start) + renderBrowserTargetDocumentation(report) +
		source.slice(end + END_MARKER.length);
}

/** Checks without writing, or explicitly refreshes only the generated compatibility block. */
export async function syncBrowserTargetDocumentation(path, report, { check = false } = {}) {
	const source = await readFile(path, "utf8");
	const updated = replaceBrowserTargetDocumentation(source, report);
	if (source === updated) {
		return false;
	}
	if (check) {
		throw new Error("Browser target documentation is stale. Run npm run browsers:report -- --write-docs and review the change.");
	}
	await writeFile(path, updated, "utf8");
	return true;
}
