import { resolveBrowserTargets, writeBrowserTargetReport } from "./lib/browser-targets.mjs";

if (process.argv.length > 2) {
	throw new Error("Use LFC_BROWSER_TARGET_DATE=YYYY-MM-DD to reproduce an earlier resolution.");
}
const report = resolveBrowserTargets();
await writeBrowserTargetReport(report);
console.log(JSON.stringify(report, null, 2));
