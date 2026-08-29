import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { expectedExtensionExport } from "../lib/package-entries.mjs";
import {
	createPackedExtensionTypeFixture,
	verifyPackedExtensions
} from "../lib/packed-extension-verification.mjs";
import { REPOSITORY_ROOT, runTsc } from "../lib/process.mjs";

async function writeModule(path, source) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, source, "utf8");
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
			"export function alpha() { return Object.freeze({}); }\n"
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
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}
});
