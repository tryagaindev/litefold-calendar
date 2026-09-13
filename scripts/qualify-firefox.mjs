import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertSupportedNodeVersion } from "./lib/node-version.mjs";
import { REPOSITORY_ROOT, run } from "./lib/process.mjs";

assertSupportedNodeVersion("Firefox qualification");

const reportRoot = join(REPOSITORY_ROOT, "test-results", "firefox-qualification");
const runs = [
	{ name: "regressions-20", arguments: ["--grep=@firefox-regression", "--repeat-each=20"] },
	...Array.from({ length: 3 }, (_value, index) => ({
		name: `complete-${String(index + 1)}`,
		arguments: []
	}))
];
await mkdir(reportRoot, { recursive: true });
for (const qualification of runs) {
	const output = join(reportRoot, qualification.name);
	await mkdir(output, { recursive: true });
	await writeFile(join(output, "environment.json"), `${JSON.stringify({
		arch: process.arch,
		node: process.version,
		platform: process.platform,
		retries: 0,
		workers: 1
	}, null, 2)}\n`);
	await run(process.execPath, [
		join(REPOSITORY_ROOT, "node_modules", "@playwright", "test", "cli.js"),
		"test",
		"--project=firefox",
		"--workers=1",
		"--retries=0",
		"--max-failures=1",
		"--reporter=line,json,html",
		`--output=${join(output, "artifacts")}`,
		...qualification.arguments
	], {
		env: {
			...process.env,
			PLAYWRIGHT_HTML_OPEN: "never",
			PLAYWRIGHT_HTML_OUTPUT_DIR: join(output, "html"),
			PLAYWRIGHT_JSON_OUTPUT_FILE: join(output, "results.json")
		}
	});
}
