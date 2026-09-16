import { join } from "node:path";

import { syncBrowserTargetDocumentation } from "./lib/browser-target-documentation.mjs";
import { resolveBrowserTargets, writeBrowserTargetReport } from "./lib/browser-targets.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";

const arguments_ = process.argv.slice(2);
const mode = arguments_[0];
if (arguments_.length > 1 || (mode !== undefined && mode !== "--write-docs" && mode !== "--check-docs")) {
	throw new Error("Usage: npm run browsers:report -- [--write-docs | --check-docs]. Use LFC_BROWSER_TARGET_DATE=YYYY-MM-DD to reproduce an earlier resolution.");
}
const report = resolveBrowserTargets();
if (mode === undefined) {
	await writeBrowserTargetReport(report);
	console.log(JSON.stringify(report, null, 2));
} else {
	const changed = await syncBrowserTargetDocumentation(
		join(REPOSITORY_ROOT, "docs", "browser-support.md"),
		report,
		{ check: mode === "--check-docs" }
	);
	console.log(changed ? "Updated browser target documentation." : "Browser target documentation is current.");
}
