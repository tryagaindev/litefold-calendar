import { posix } from "node:path";

import ts from "typescript";

const PRIVATE_CHUNK = /^dist\/chunks\/[A-Za-z0-9_$.-]+-[A-Za-z0-9_-]{8,}\.js$/u;
const BASE_FILES = ["LICENSE", "README.md", "package.json", "dist/styles.css", "dist/styles.css.d.ts"];

export function requiredPackageFiles(sourceModules, publicJavaScript) {
	return new Set([
		...BASE_FILES,
		...sourceModules.flatMap((name) => [`dist/${name}.d.ts`, `dist/${name}.d.ts.map`]),
		...publicJavaScript.flatMap((path) => [path, `${path}.map`])
	]);
}

export function inspectDistributionInventory(paths, sourceModules, publicJavaScript, { packed = false } = {}) {
	const errors = [];
	const actual = new Set(paths);
	const required = requiredPackageFiles(sourceModules, publicJavaScript);
	for (const path of actual) {
		if (!required.has(path) && !PRIVATE_CHUNK.test(path.replace(/\.map$/u, ""))) {
			errors.push(`Unexpected ${packed ? "packed" : "built"} file: ${path}.`);
		}
		if (path.endsWith(".js") && !actual.has(`${path}.map`)) {
			errors.push(`${path} requires a companion JavaScript source map.`);
		}
		if (path.endsWith(".js.map") && !actual.has(path.slice(0, -4))) {
			errors.push(`${path} has no corresponding JavaScript output.`);
		}
	}
	for (const path of required) {
		if ((packed || path.startsWith("dist/")) && !actual.has(path)) {
			errors.push(`Required ${packed ? "packed" : "built"} file is missing: ${path}.`);
		}
	}
	return errors;
}

function readSourceMap(path, content, sources, errors) {
	let sourceMap;
	try {
		sourceMap = JSON.parse(content);
	} catch {
		errors.push(`${path} is not valid JSON.`);
		return [];
	}
	if (sourceMap === null || typeof sourceMap !== "object" || Array.isArray(sourceMap)) {
		errors.push(`${path} must contain a source map object.`);
		return [];
	}
	if (sourceMap.version !== 3 || !Array.isArray(sourceMap.names) || typeof sourceMap.mappings !== "string") {
		errors.push(`${path} must contain a version 3 source map with names and mappings.`);
	}
	if (sourceMap.file !== posix.basename(path.slice(0, -4))) {
		errors.push(`${path} must identify its companion output as the generated file.`);
	}
	if (sourceMap.sourceRoot !== undefined && sourceMap.sourceRoot !== "") {
		errors.push(`${path} must use an empty sourceRoot.`);
	}
	if (!Array.isArray(sourceMap.sources) || !sourceMap.sources.every((value) => typeof value === "string")) {
		errors.push(`${path} must list relative source paths.`);
		return [];
	}
	const resolvedSources = sourceMap.sources.map((source) => posix.join(posix.dirname(path), source));
	for (let index = 0; index < sourceMap.sources.length; index += 1) {
		const source = sourceMap.sources[index];
		const resolved = resolvedSources[index];
		if (source.includes("\\") || posix.isAbsolute(source) || !sources.has(resolved)) {
			errors.push(`${path} source ${JSON.stringify(source)} must resolve to a repository src/ TypeScript module.`);
			continue;
		}
		if (path.endsWith(".js.map") && sourceMap.sourcesContent?.[index] !== sources.get(resolved)) {
			errors.push(`${path} must embed matching sourcesContent for ${resolved}.`);
		}
	}
	if (path.endsWith(".js.map") &&
		(!Array.isArray(sourceMap.sourcesContent) || sourceMap.sourcesContent.length !== sourceMap.sources.length)) {
		errors.push(`${path} must embed sourcesContent for every source.`);
	}
	if (path.endsWith(".d.ts.map")) {
		const expectedSource = `src/${path.slice("dist/".length, -".d.ts.map".length)}.ts`;
		if (resolvedSources.length !== 1 || resolvedSources[0] !== expectedSource) {
			errors.push(`${path} sources must resolve only to ${expectedSource}.`);
		}
	}
	return resolvedSources.filter((source) => sources.has(source));
}

function getModuleReferences(sourceFile) {
	const references = [];
	const visit = (node) => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
			references.push(node.moduleSpecifier);
		} else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
			node.moduleReference.expression !== undefined) {
			references.push(node.moduleReference.expression);
		} else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
			references.push(node.argument.literal);
		} else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			references.push(node.arguments[0]);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return references;
}

function resolveModuleReferences(path, sourceFile, files, errors) {
	const targets = [];
	for (const reference of getModuleReferences(sourceFile)) {
		if (reference === undefined || !ts.isStringLiteralLike(reference)) {
			errors.push(`${path} contains a non-literal module reference.`);
			continue;
		}
		const specifier = reference.text;
		if ((!specifier.startsWith("./") && !specifier.startsWith("../")) || specifier.includes("\\")) {
			errors.push(`${path} references non-relative module ${JSON.stringify(specifier)}.`);
			continue;
		}
		let target = posix.join(posix.dirname(path), specifier);
		if (path.endsWith(".d.ts") && target.endsWith(".js")) {
			target = `${target.slice(0, -3)}.d.ts`;
		}
		if (!target.startsWith("dist/") || !files.has(target) ||
			(path.endsWith(".js") && !target.endsWith(".js"))) {
			errors.push(`${path} module ${JSON.stringify(specifier)} must resolve to a shipped ${path.endsWith(".js") ? "JavaScript" : "declaration"} module inside dist/.`);
			continue;
		}
		targets.push(target);
	}
	return targets;
}

function visitGraph(entry, graph) {
	const visited = new Set();
	const pending = [entry];
	while (pending.length > 0) {
		const path = pending.pop();
		if (visited.has(path)) {
			continue;
		}
		visited.add(path);
		pending.push(...(graph.get(path) ?? []));
	}
	return visited;
}

//Validate bytes that will ship, without relying on private source-to-output filenames.
export function inspectPackageBundles({ files, sources, sourceModules, publicJavaScript }) {
	const errors = inspectDistributionInventory([...files.keys()], sourceModules, publicJavaScript);
	const provenance = new Map();
	const graph = new Map();
	for (const [path, content] of files) {
		if (path.endsWith(".js.map") || path.endsWith(".d.ts.map")) {
			provenance.set(path.slice(0, -4), readSourceMap(path, content, sources, errors));
		}
	}
	for (const [path, content] of files) {
		if (!path.endsWith(".js") && !path.endsWith(".d.ts")) {
			continue;
		}
		const declaration = path.endsWith(".d.ts");
		const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true,
			declaration ? ts.ScriptKind.TS : ts.ScriptKind.JS);
		const references = resolveModuleReferences(path, sourceFile, files, errors);
		if (!declaration) {
			graph.set(path, references);
			if (sourceFile.parseDiagnostics.length > 0) {
				errors.push(`${path} must contain valid JavaScript.`);
			}
			const sourceMapComments = [...content.matchAll(/\/\/[#@]\s*sourceMappingURL=(\S+)/gu)];
			if (sourceMapComments.length !== 1 || sourceMapComments[0][1] !== `${posix.basename(path)}.map`) {
				errors.push(`${path} must reference only its companion source map.`);
			}
			const forwardingOnly = sourceFile.statements.every((statement) =>
				ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isEmptyStatement(statement));
			if (!forwardingOnly && (provenance.get(path)?.length ?? 0) === 0) {
				errors.push(`${path} contains runtime code without repository source provenance.`);
			}
		}
	}
	const reachable = new Set();
	for (const entry of publicJavaScript) {
		const extensionId = /^dist\/extensions\/([^/]+)\/index\.js$/u.exec(entry)?.[1];
		for (const path of visitGraph(entry, graph)) {
			reachable.add(path);
			for (const source of provenance.get(path) ?? []) {
				const sourceExtension = /^src\/extensions\/([^/]+)\//u.exec(source)?.[1];
				if (sourceExtension !== undefined && sourceExtension !== extensionId) {
					errors.push(`${entry} reaches optional extension ${JSON.stringify(sourceExtension)} source ${source} through ${path}.`);
				}
			}
		}
	}
	for (const path of graph.keys()) {
		if (!reachable.has(path)) {
			errors.push(`${path} is not reachable from a public package entry.`);
		}
	}
	return errors;
}
