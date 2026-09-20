import { run, runNpm } from "./lib/process.mjs";
import { prepareScreenshots } from "./lib/screenshot-preparation.mjs";
import {
	assertPinnedNpm, assertPinnedPlaywright, assertSupportedNode, computeSourceFingerprint
} from "./screenshot-contract.mjs";

assertSupportedNode();
assertPinnedNpm();
await assertPinnedPlaywright();
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--force")) {
	throw new Error("Usage: npm run screenshots:prepare [-- --force]");
}

const verify = () => run(process.execPath, ["scripts/check-screenshots.mjs"]);
const result = await prepareScreenshots({
	force: arguments_.includes("--force"),
	checkCurrent: async () => {
		try {
			await run(process.execPath, ["scripts/check-screenshots.mjs"], { capture: true });
			return true;
		} catch { return false; }
	},
	build: async () => {
		const fingerprint = await computeSourceFingerprint();
		await runNpm(["run", "build:package"]);
		await runNpm(["run", "build:examples:advanced"]);
		if (await computeSourceFingerprint() !== fingerprint) {
			throw new Error("Screenshot sources changed during build. Retry after edits settle.");
		}
	},
	capture: () => run(process.execPath, ["scripts/update-screenshots.mjs"]),
	verify
});
console.log(result === "current"
	? "Screenshot evidence is current; no build or capture was needed."
	: "Screenshot evidence prepared. Review .cache/screenshots/review/index.html before committing.");
