import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import test from "node:test";

import { expectedExtensionExport } from "../lib/package-entries.mjs";
import {
	createPackedExtensionTypeFixture,
	verifyPackedExtensions
} from "../lib/packed-extension-verification.mjs";
import { REPOSITORY_ROOT, runTsc } from "../lib/process.mjs";

async function writeModule(path, source, sourceModule) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, source, "utf8");
	if (path.endsWith(".js")) {
		const normalizedPath = path.replaceAll(sep, "/");
		const distIndex = normalizedPath.lastIndexOf("/dist/");
		const originalPath = sourceModule === undefined
			? `${normalizedPath.slice(0, distIndex)}/src/${normalizedPath.slice(distIndex + 6, -3)}.ts`
			: `${normalizedPath.slice(0, distIndex)}/${sourceModule}`;
		await writeFile(`${path}.map`, JSON.stringify({
			file: basename(path), mappings: "AAAA", names: [],
			sources: [relative(dirname(path), originalPath).replaceAll(sep, "/")],
			sourcesContent: [source], version: 3
		}), "utf8");
	}
}

void test("packed extension verification proves isolated bundles and public aggregate types", async () => {
	const artifactDirectory = join(REPOSITORY_ROOT, ".artifacts");
	await mkdir(artifactDirectory, { recursive: true });
	const fixtureDirectory = await mkdtemp(join(artifactDirectory, "extension-verification-"));
	const packageName = "@example/litefold-fixture";
	const installedPackage = join(fixtureDirectory, "node_modules", packageName);
	const packageJson = {
		exports: {
			".": {
				default: "./dist/index.js",
				import: "./dist/index.js",
				types: "./dist/index.d.ts"
			},
			"./extensions/alpha": expectedExtensionExport("alpha"),
			"./extensions/beta": expectedExtensionExport("beta")
		},
		name: packageName,
		sideEffects: false,
		type: "module"
	};

	try {
		await writeModule(
			join(installedPackage, "package.json"),
			`${JSON.stringify(packageJson, null, 2)}\n`
		);
		await writeModule(
			join(installedPackage, "dist", "index.js"),
			"export function createCalendar() { return undefined; }\n"
		);
		await writeModule(
			join(installedPackage, "dist", "index.d.ts"),
			[
				"declare const calendarExtensionBrand: unique symbol;",
				"export interface CalendarExtension {",
				"\treadonly [calendarExtensionBrand]: never;",
				"}",
				"export interface CalendarEventInput<TMetadata> {",
				"\treadonly id: string;",
				"\treadonly metadata?: TMetadata;",
				"\treadonly start: string;",
				"\treadonly title: string;",
				"}",
				"export interface CalendarOptions<TMetadata> {",
				"\treadonly events?: readonly CalendarEventInput<TMetadata>[];",
				"\treadonly extensions?: readonly CalendarExtension[];",
				"}",
				"export interface Calendar<TMetadata> {",
				"\tgetState(): unknown;",
				"\tsetEvents(events: readonly CalendarEventInput<TMetadata>[]): void;",
				"}",
				"export declare function createCalendar<TMetadata>(",
				"\thost: HTMLElement,",
				"\toptions: CalendarOptions<TMetadata>",
				"): Calendar<TMetadata>;",
				""
			].join("\n")
		);
		await writeModule(
			join(installedPackage, "dist", "extensions", "alpha", "index.js"),
			'export { alpha } from "../../chunks/alpha-a1234567.js";\n'
		);
		await writeModule(
			join(installedPackage, "dist", "chunks", "alpha-a1234567.js"),
			"export function alpha() { return Object.freeze({}); }\n",
			"src/extensions/alpha/implementation.ts"
		);
		await writeModule(
			join(installedPackage, "dist", "extensions", "alpha", "index.d.ts"),
			[
				`import type { CalendarExtension } from ${JSON.stringify(packageName)};`,
				"export declare function alpha(): CalendarExtension;",
				""
			].join("\n")
		);
		await writeModule(
			join(installedPackage, "dist", "extensions", "beta", "index.js"),
			"export function beta() { return Object.freeze({}); }\n"
		);
		await writeModule(
			join(installedPackage, "dist", "extensions", "beta", "index.d.ts"),
			[
				`import type { CalendarExtension } from ${JSON.stringify(packageName)};`,
				"export declare function beta(): CalendarExtension;",
				""
			].join("\n")
		);

		const factories = await verifyPackedExtensions(
			fixtureDirectory,
			installedPackage,
			packageJson
		);

		assert.deepEqual(
			factories.map(({ factoryName, id }) => ({ factoryName, id })),
			[
				{ factoryName: "alpha", id: "alpha" },
				{ factoryName: "beta", id: "beta" }
			]
		);

		await writeModule(
			join(fixtureDirectory, "consumer.ts"),
			createPackedExtensionTypeFixture(packageJson, factories)
		);
		await writeModule(
			join(fixtureDirectory, "tsconfig.json"),
			`${JSON.stringify({
				compilerOptions: {
					exactOptionalPropertyTypes: true,
					lib: ["ES2022", "DOM", "DOM.Iterable"],
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					noUncheckedIndexedAccess: true,
					skipLibCheck: false,
					strict: true,
					target: "ES2022",
					types: []
				},
				files: ["consumer.ts"]
			}, null, 2)}\n`
		);
		await runTsc(["-p", "tsconfig.json", "--pretty", "false"], { cwd: fixtureDirectory });
		await writeModule(join(installedPackage, "dist", "index.js"),
			'import { alpha } from "./chunks/alpha-a1234567.js";\nexport function createCalendar() { return undefined; }\n');
		await verifyPackedExtensions(fixtureDirectory, installedPackage, packageJson);

		await writeModule(
			join(installedPackage, "dist", "chunks", "hidden-b7654321.js"),
			"export const extra = 1;\n",
			"src/extensions/beta/implementation.ts"
		);
		await writeModule(
			join(installedPackage, "dist", "index.js"),
			'import { extra } from "./chunks/hidden-b7654321.js";\nexport function createCalendar() { return extra; }\n'
		);
		await assert.rejects(verifyPackedExtensions(fixtureDirectory, installedPackage, packageJson),
			/Core-only fixture bundled extensions \[beta\]/u);
		await writeModule(join(installedPackage, "dist", "index.js"),
			"export function createCalendar() { return undefined; }\n");
		await writeFile(join(installedPackage, "dist", "chunks", "alpha-a1234567.js.map"),
			JSON.stringify({ file: "alpha-a1234567.js", mappings: "", sources: ["../../../outside.ts"],
				sourcesContent: ["export const x = 1;"], version: 3 }), "utf8");
		await assert.rejects(verifyPackedExtensions(fixtureDirectory, installedPackage, packageJson),
			/must resolve beneath the package src/u);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});
