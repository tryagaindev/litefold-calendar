import { run, runNpm } from "./lib/process.mjs";
import { prepareScreenshots } from "./lib/screenshot-preparation.mjs";
import {
	assertPinnedNpm, assertPinnedPlaywright, assertSupportedNode, computeSourceFingerprint
} from "./screenshot-contract.mjs";

assertSupportedNode();
assertPinnedNpm();
await assertPinnedPlaywright();
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--force" && argument !== "--candidate") ||
	new Set(arguments_).size !== arguments_.length) {
	throw new Error("Usage: npm run screenshots:prepare [-- --force] [--candidate]");
}

const verify = () => run(process.execPath, ["scripts/check-screenshots.mjs"]);
const result = await prepareScreenshots({
	force: arguments_.includes("--force"),
	candidate: arguments_.includes("--candidate"),
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
	capture: ({ candidate }) => run(process.execPath,
		["scripts/update-screenshots.mjs", ...(candidate ? ["--candidate"] : [])]),
	verify
});
console.log(result === "current"
	? "Screenshot evidence is current; no build or capture was needed."
	: result === "candidate"
		? "Screenshot candidate prepared. Review .cache/screenshots/candidate/index.html; canonical evidence was preserved."
		: "Screenshot evidence prepared. Review .cache/screenshots/review/index.html before committing.");
