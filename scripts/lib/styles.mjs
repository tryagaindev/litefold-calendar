import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "./process.mjs";

const STYLE_SOURCE_DIRECTORY = join(REPOSITORY_ROOT, "src", "styles");
const LAYER_START = "@layer lfc {\n";
const LAYER_END = "\n}\n";

/** The required source-module order. This sequence is part of the stylesheet cascade contract. */
export const STYLE_MODULE_ORDER = Object.freeze([
	"tokens.css",
	"base.css",
	"toolbar.css",
	"pager.css",
	"month-grid.css",
	"agenda.css",
	"responsive.css",
	"preferences.css"
]);

function displayModuleNames(moduleNames) {
	return moduleNames.join(", ");
}

/** Verifies that a proposed module sequence is complete, unique, and canonical. */
export function assertStyleModuleOrder(moduleNames) {
	if (!Array.isArray(moduleNames)) {
		throw new TypeError("Style module order must be an array.");
	}

	const duplicates = moduleNames.filter(
		(moduleName, index) => moduleNames.indexOf(moduleName) !== index
	);
	if (duplicates.length > 0) {
		throw new Error(
			`Style module order contains duplicated modules: ${displayModuleNames([...new Set(duplicates)])}.`
		);
	}

	const missing = STYLE_MODULE_ORDER.filter((moduleName) => !moduleNames.includes(moduleName));
	const unexpected = moduleNames.filter((moduleName) => !STYLE_MODULE_ORDER.includes(moduleName));
	if (missing.length > 0 || unexpected.length > 0) {
		const details = [];
		if (missing.length > 0) {
			details.push(`missing ${displayModuleNames(missing)}`);
		}
		if (unexpected.length > 0) {
			details.push(`contains unexpected ${displayModuleNames(unexpected)}`);
		}
		throw new Error(`Style module order ${details.join(" and ")}.`);
	}

	const incorrectlyOrdered = moduleNames.some(
		(moduleName, index) => moduleName !== STYLE_MODULE_ORDER[index]
	);
	if (incorrectlyOrdered) {
		throw new Error(
			`Style modules are incorrectly ordered; expected ${displayModuleNames(STYLE_MODULE_ORDER)}.`
		);
	}
}

function assertStyleModuleFiles(entries) {
	const cssEntries = entries.filter((entry) => entry.name.endsWith(".css"));
	const invalidEntries = cssEntries.filter((entry) => !entry.isFile());
	if (invalidEntries.length > 0) {
		throw new Error(
			`The style module directory contains unsupported entries: ${displayModuleNames(
				invalidEntries.map((entry) => entry.name).sort((left, right) => left.localeCompare(right, "en"))
			)}.`
		);
	}

	const availableNames = cssEntries.map((entry) => entry.name);
	const missing = STYLE_MODULE_ORDER.filter((moduleName) => !availableNames.includes(moduleName));
	const unexpected = availableNames.filter((moduleName) => !STYLE_MODULE_ORDER.includes(moduleName));
	if (missing.length > 0 || unexpected.length > 0) {
		const details = [];
		if (missing.length > 0) {
			details.push(`missing ${displayModuleNames(missing)}`);
		}
		if (unexpected.length > 0) {
			details.push(`contains unexpected ${displayModuleNames(unexpected)}`);
		}
		throw new Error(`The style module directory ${details.join(" and ")}.`);
	}
}

function extractLayerBody(moduleName, source) {
	const normalizedSource = source.replace(/\r\n?/gu, "\n");
	if (!normalizedSource.startsWith(LAYER_START) || !normalizedSource.endsWith(LAYER_END)) {
		throw new Error(
			`${moduleName} must contain one newline-terminated @layer lfc block.`
		);
	}

	return normalizedSource.slice(LAYER_START.length, -LAYER_END.length);
}

/** Composes the ordered source modules into the package's single public stylesheet. */
export async function composeStyles({
	moduleNames = STYLE_MODULE_ORDER,
	sourceDirectory = STYLE_SOURCE_DIRECTORY
} = {}) {
	assertStyleModuleOrder(moduleNames);
	const entries = await readdir(sourceDirectory, { withFileTypes: true });
	assertStyleModuleFiles(entries);

	const moduleSources = await Promise.all(
		moduleNames.map(async (moduleName) => ({
			moduleName,
			source: await readFile(join(sourceDirectory, moduleName), "utf8")
		}))
	);
	const layerBodies = moduleSources.map(({ moduleName, source }) =>
		extractLayerBody(moduleName, source)
	);

	return `${LAYER_START}${layerBodies.join("\n\n")}${LAYER_END}`;
}
