import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "../lib/process.mjs";

const EXAMPLE_DIRECTORY = join(REPOSITORY_ROOT, "examples", "advanced");

export async function verifyAdvancedStyleContracts() {
	const packageStyles = await readFile(join(REPOSITORY_ROOT, "src", "styles.css"), "utf8");
	const exampleStyles = await readFile(join(EXAMPLE_DIRECTORY, "theme.css"), "utf8");
	const narrowAgendaStart = packageStyles.indexOf("@container lfc-calendar (inline-size < 24rem)");
	const narrowToolbarStart = packageStyles.indexOf("@container lfc-calendar (inline-size <= 20rem)");
	assert.ok(
		narrowAgendaStart >= 0 && narrowToolbarStart > narrowAgendaStart,
		"Expected ordered narrow-container rules."
	);
	const narrowAgendaStyles = packageStyles.slice(narrowAgendaStart, narrowToolbarStart);
	assert.match(
		narrowAgendaStyles,
		/\.lfc-calendar-event-title\s*\{[^}]*\bgrid-column:\s*1\s*\/\s*-1;[^}]*\bgrid-row:\s*2;/u,
		"Expected narrow agenda titles to wrap across the full row."
	);
	assert.equal(
		[...narrowAgendaStyles.matchAll(/\.lfc-calendar-event-(?:details|trailing)\s*\{[^}]*\bgrid-column:\s*1\s*\/\s*-1;/gu)].length,
		2,
		"Expected narrow agenda details and trailing content to wrap across the full row."
	);
	assert.match(
		packageStyles,
		/\.lfc-calendar-more\s*\{[^}]*\bpadding-inline:\s*0\.25rem;/u,
		"Expected the grid overflow row to preserve an inline text inset."
	);
	assert.equal(
		[...packageStyles.matchAll(/border-radius:\s*var\(--lfc-internal-event-border-radius\);/gu)].length,
		2,
		"Expected grid summaries and agenda rows to share the capped event radius."
	);
	assert.match(
		packageStyles,
		/:dir\(rtl\)\s+\.lfc-calendar-navigation-icon\s*\{[^}]*\btransform:\s*scaleX\(-1\);/u,
		"Expected built-in navigation icons to mirror with semantic RTL direction."
	);
	assert.match(
		exampleStyles,
		/\.advanced-example-calendar:dir\(rtl\)\s+\.advanced-example-navigation-icon\s*\{[^}]*\btransform:\s*scaleX\(-1\);/u,
		"Expected custom navigation icons to mirror with semantic RTL direction."
	);
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
