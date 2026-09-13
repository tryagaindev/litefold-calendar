import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** Reads the original TypeScript sources represented by a shipped JavaScript module. */
export async function readDistributionSourceProvenance(modulePath, packageDirectory) {
	const mapPath = `${modulePath}.map`;
	const sourceMap = JSON.parse(await readFile(mapPath, "utf8"));
	if (sourceMap === null || typeof sourceMap !== "object" || sourceMap.version !== 3 ||
		sourceMap.file !== basename(modulePath) ||
		(sourceMap.sourceRoot !== undefined && sourceMap.sourceRoot !== "") ||
		!Array.isArray(sourceMap.sources) || !Array.isArray(sourceMap.sourcesContent) ||
		sourceMap.sources.length !== sourceMap.sourcesContent.length ||
		typeof sourceMap.mappings !== "string") {
		throw new Error(`${mapPath} must contain a companion source map with embedded source provenance.`);
	}
	return Object.freeze(sourceMap.sources.map((source, index) => {
		if (typeof source !== "string" || isAbsolute(source) || source.includes("\\") ||
			typeof sourceMap.sourcesContent[index] !== "string") {
			throw new Error(`${mapPath} must contain relative TypeScript sources with embedded content.`);
		}
		const path = relative(packageDirectory, resolve(dirname(mapPath), source)).replaceAll(sep, "/");
		if (!/^src\/.+\.ts$/u.test(path) || path.endsWith(".d.ts")) {
			throw new Error(`${mapPath} source ${source} must resolve beneath the package src/ directory.`);
		}
		return path;
	}));
}

/** Identifies optional extension code independently of bundled output filenames. */
export function extensionIdsFromSources(sources) {
	return new Set(sources.flatMap((source) => {
		const match = /^src\/extensions\/([^/]+)\//u.exec(source);
		return match === null ? [] : [match[1]];
	}));
}
