import { run } from "./lib/process.mjs";

const arguments_ = process.argv.slice(2);
if (arguments_.length !== 2 || arguments_[0] !== "--plan" || !arguments_[1]) {
	throw new Error("Usage: npm run package:nightly -- --plan <verified-nightly-plan.json>");
}
await run(process.execPath, ["scripts/nightly-release.mjs", "verify", ...arguments_]);
await run(process.execPath, ["scripts/pack-release.mjs", "--nightly-plan", arguments_[1]]);
