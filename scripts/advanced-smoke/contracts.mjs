import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "../lib/process.mjs";
import { composeStyles } from "../lib/styles.mjs";

const EXAMPLE_DIRECTORY = join(REPOSITORY_ROOT, "examples", "advanced");

export async function verifyAdvancedThemeTokenCoverage() {
	const packageStyles = await composeStyles();
	const exampleStyles = await readFile(join(EXAMPLE_DIRECTORY, "theme.css"), "utf8");
	const publicTokens = new Set(
		[...packageStyles.matchAll(/(--lfc-(?!internal-)[a-z0-9-]+)\s*:/gu)]
			.map((match) => match[1])
	);
	const exercisedTokens = new Set(
		[...exampleStyles.matchAll(/(--lfc-[a-z0-9-]+)\s*:/gu)]
			.map((match) => match[1])
	);
	for (const token of publicTokens) {
		assert.ok(exercisedTokens.has(token), `The advanced theme must exercise ${token}.`);
	}
}
