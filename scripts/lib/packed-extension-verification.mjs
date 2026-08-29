import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { extractExtensionEntries } from "./package-entries.mjs";

function assertExactExtensionSet(actual, expected, description) {
	const actualIds = [...actual].sort((left, right) => left.localeCompare(right, "en"));
	const expectedIds = [...expected].sort((left, right) => left.localeCompare(right, "en"));
	if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
		throw new Error(
			`${description} bundled extensions [${actualIds.join(", ")}]; expected [${expectedIds.join(", ")}].`
		);
	}
}

function bundledExtensionIds(metafile, packageName) {
	const packageMarker = `/node_modules/${packageName}/dist/extensions/`;
	const ids = new Set();

	for (const inputPath of Object.keys(metafile.inputs)) {
		const normalizedPath = `/${inputPath.replaceAll("\\", "/")}`;
		const markerIndex = normalizedPath.lastIndexOf(packageMarker);
		if (markerIndex < 0) {
			continue;
		}

		const relativeExtensionPath = normalizedPath.slice(
			markerIndex + packageMarker.length
		);
		const id = relativeExtensionPath.split("/", 1)[0];
		if (id !== undefined && id.length > 0) {
			ids.add(id);
		}
	}

	return ids;
}

async function inspectExtensionFactories(installedPackage, extensionEntries) {
	const factories = [];

	for (const entry of extensionEntries) {
		const moduleUrl = pathToFileURL(join(installedPackage, entry.distJavaScript)).href;
		const extensionModule = await import(
			`${moduleUrl}?packed-extension-check=${Date.now().toString()}-${entry.id}`
		);
		const runtimeExports = Object.keys(extensionModule);
		if (runtimeExports.length !== 1) {
			throw new Error(
				`${entry.exportPath} must expose exactly one runtime extension factory; found ${runtimeExports.join(", ") || "none"}.`
			);
		}

		const factoryName = runtimeExports[0];
		const factory = extensionModule[factoryName];
		if (factoryName === undefined || typeof factory !== "function") {
			throw new Error(`${entry.exportPath} runtime export must be an extension factory function.`);
		}

		if (factoryName.toLowerCase() !== entry.id.replaceAll("-", "")) {
			throw new Error(
				`${entry.exportPath} factory ${factoryName} must identify extension ${entry.id}.`
			);
		}

		const configuredExtension = factory();
		if (configuredExtension === null || typeof configuredExtension !== "object" ||
			!Object.isFrozen(configuredExtension)) {
			throw new Error(`${entry.exportPath} factory must return an immutable configured extension.`);
		}

		factories.push(Object.freeze({ ...entry, factoryName }));
	}

	return Object.freeze(factories);
}

function packedPackagePlugin(installedPackage, packageJson) {
	const packageNamePattern = packageJson.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

	return {
		name: "packed-package",
		setup(buildContext) {
			buildContext.onResolve(
				{ filter: new RegExp(`^${packageNamePattern}(?:/.*)?$`) },
				(args) => {
					const exportPath = args.path === packageJson.name
						? "."
						: `.${args.path.slice(packageJson.name.length)}`;
					const target = packageJson.exports?.[exportPath];
					const importTarget = typeof target === "string"
						? target
						: target?.import ?? target?.default;
					if (typeof importTarget !== "string") {
						return { errors: [{ text: `Packed package does not export ${args.path}.` }] };
					}

					return {
						namespace: "packed-package",
						path: resolve(installedPackage, importTarget)
					};
				}
			);
			buildContext.onResolve(
				{ filter: /^\./, namespace: "packed-package" },
				(args) => ({
					namespace: "packed-package",
					path: resolve(dirname(args.importer), args.path)
				})
			);
			buildContext.onLoad(
				{ filter: /\.js$/, namespace: "packed-package" },
				async (args) => ({
					contents: await readFile(args.path, "utf8"),
					loader: "js",
					resolveDir: dirname(args.path)
				})
			);
		}
	};
}

async function bundleFixture(
	fixtureDirectory,
	installedPackage,
	packageJson,
	name,
	source
) {
	return build({
		absWorkingDir: fixtureDirectory,
		bundle: true,
		format: "esm",
		logLevel: "silent",
		metafile: true,
		platform: "browser",
		plugins: [packedPackagePlugin(installedPackage, packageJson)],
		splitting: true,
		stdin: {
			contents: source,
			loader: "js",
			resolveDir: fixtureDirectory,
			sourcefile: `.extension-fixtures/${name}.mjs`
		},
		treeShaking: true,
		write: false,
		outdir: join(fixtureDirectory, ".extension-bundles", name)
	}).then((result) => bundledExtensionIds(result.metafile, packageJson.name));
}

function extensionImport(packageName, factory, localName = factory.factoryName) {
	const binding = localName === factory.factoryName
		? factory.factoryName
		: `${factory.factoryName} as ${localName}`;
	return `import { ${binding} } from ${JSON.stringify(`${packageName}${factory.exportPath.slice(1)}`)};`;
}

export function createPackedExtensionTypeFixture(packageJson, factories) {
	if (factories.length === 0) {
		throw new Error("Packed extension type verification requires at least one extension factory.");
	}

	return [
		...factories.map((factory, index) =>
			extensionImport(packageJson.name, factory, `extensionFactory${index.toString()}`)
		),
		"import {",
		"\tcreateCalendar,",
		"\ttype Calendar,",
		"\ttype CalendarEventInput,",
		"\ttype CalendarExtension,",
		"\ttype CalendarOptions",
		`} from ${JSON.stringify(packageJson.name)};`,
		"",
		"interface Metadata {",
		"\treadonly sourceId: string;",
		"}",
		"",
		"const events: readonly CalendarEventInput<Metadata>[] = [{",
		"\tid: \"typed-replacement\",",
		"\tmetadata: { sourceId: \"packed-consumer\" },",
		"\tstart: \"2026-07-14\",",
		"\ttitle: \"Typed replacement\"",
		"}];",
		"const configuredExtensions = [",
		...factories.map((_factory, index) =>
			`\textensionFactory${index.toString()}(),`
		),
		"] satisfies readonly CalendarExtension[];",
		"const optionsWithoutExtensions: CalendarOptions<Metadata> = { events };",
		"const optionsWithOneExtension: CalendarOptions<Metadata> = {",
		"\tevents,",
		"\textensions: [extensionFactory0()]",
		"};",
		"const optionsWithAllExtensions: CalendarOptions<Metadata> = {",
		"\tevents,",
		"\textensions: configuredExtensions",
		"};",
		"declare const host: HTMLElement;",
		"const calendars: readonly Calendar<Metadata>[] = [",
		"\tcreateCalendar(host, optionsWithoutExtensions),",
		"\tcreateCalendar(host, optionsWithOneExtension),",
		"\tcreateCalendar(host, optionsWithAllExtensions)",
		"];",
		"for (const calendar of calendars) {",
		"\tcalendar.setEvents(events);",
		"\tvoid calendar.getState();",
		"}",
		""
	].join("\n");
}

export async function verifyPackedExtensions(fixtureDirectory, installedPackage, packageJson) {
	const extensionEntries = extractExtensionEntries(packageJson);
	if (extensionEntries.length === 0) {
		throw new Error("Packed extension verification requires at least one exported extension.");
	}

	const factories = await inspectExtensionFactories(installedPackage, extensionEntries);
	const coreExtensions = await bundleFixture(
		fixtureDirectory,
		installedPackage,
		packageJson,
		"core",
		`export { createCalendar } from ${JSON.stringify(packageJson.name)};\n`
	);
	assertExactExtensionSet(coreExtensions, [], "Core-only fixture");

	for (const factory of factories) {
		const selectedExtensions = await bundleFixture(
			fixtureDirectory,
			installedPackage,
			packageJson,
			factory.id,
			[
				`export { createCalendar } from ${JSON.stringify(packageJson.name)};`,
				extensionImport(packageJson.name, factory),
				`export const configuredExtension = ${factory.factoryName}();`,
				""
			].join("\n")
		);
		assertExactExtensionSet(selectedExtensions, [factory.id], `${factory.exportPath} fixture`);
	}

	const aggregateExtensions = await bundleFixture(
		fixtureDirectory,
		installedPackage,
		packageJson,
		"all-extensions",
		[
			`import { createCalendar } from ${JSON.stringify(packageJson.name)};`,
			...factories.map((factory, index) =>
				extensionImport(packageJson.name, factory, `extensionFactory${index.toString()}`)
			),
			"const configuredExtensions = Object.freeze([",
			...factories.map((_factory, index) => `\textensionFactory${index.toString()}(),`),
			"]);",
			"export const calendar = createCalendar(document.createElement(\"div\"), {",
			"\tevents: [],",
			"\textensions: configuredExtensions",
			"});",
			""
		].join("\n")
	);
	assertExactExtensionSet(
		aggregateExtensions,
		factories.map((factory) => factory.id),
		"All-extensions fixture"
	);

	return factories;
}
