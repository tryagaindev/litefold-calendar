import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "./process.mjs";

const EXTENSION_EXPORT_PREFIX = "./extensions/";
const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export const ROOT_PACKAGE_EXPORT = Object.freeze({
	default: "./dist/index.js",
	import: "./dist/index.js",
	types: "./dist/index.d.ts"
});

export const STYLE_PACKAGE_EXPORT = Object.freeze({
	default: "./dist/styles.css",
	types: "./dist/styles.css.d.ts"
});

export function expectedExtensionExport(id) {
	return Object.freeze({
		default: `./dist/extensions/${id}/index.js`,
		import: `./dist/extensions/${id}/index.js`,
		types: `./dist/extensions/${id}/index.d.ts`
	});
}

export function extractExtensionEntries(packageJson) {
	const packageExports = packageJson?.exports;
	if (packageExports === null || typeof packageExports !== "object" || Array.isArray(packageExports)) {
		throw new TypeError("package.json exports must be an object.");
	}

	const entries = [];
	for (const exportPath of Object.keys(packageExports)) {
		if (!exportPath.startsWith(EXTENSION_EXPORT_PREFIX)) {
			continue;
		}

		const id = exportPath.slice(EXTENSION_EXPORT_PREFIX.length);
		if (!EXTENSION_ID_PATTERN.test(id)) {
			throw new TypeError(
				`Extension export ${JSON.stringify(exportPath)} must end in one lowercase kebab-case identifier.`
			);
		}

		entries.push(Object.freeze({
			distDeclaration: `dist/extensions/${id}/index.d.ts`,
			distJavaScript: `dist/extensions/${id}/index.js`,
			exportPath,
			id,
			sourceEntry: `src/extensions/${id}/index.ts`,
			sourceModule: `extensions/${id}/index`
		}));
	}

	entries.sort((left, right) => left.id.localeCompare(right.id, "en"));
	return Object.freeze(entries);
}

export async function readPackageManifest() {
	return JSON.parse(
		await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8")
	);
}
