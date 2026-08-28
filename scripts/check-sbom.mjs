import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, runNpm } from "./lib/process.mjs";

const EXPECTED_SPDX_VERSION = "SPDX-2.3";
const EXPECTED_DOCUMENT_LICENSE = "CC0-1.0";
const EXPECTED_PACKAGE_LICENSE = "MIT";
const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SOURCE_REPOSITORY = "https://github.com/tryagaindev/litefold-calendar";
const USAGE = "Usage: node scripts/check-sbom.mjs " +
	"[--json --source-commit <sha> --source-date-epoch <epoch>]";

function assertRecord(value, description) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${description} must be an object.`);
	}
	return value;
}

function npmPurl(name, version) {
	const encodedName = name.split("/").map((segment) => encodeURIComponent(segment)).join("/");
	return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function validateSbom(sbomValue, packageJson) {
	const sbom = assertRecord(sbomValue, "SPDX document");
	if (sbom.spdxVersion !== EXPECTED_SPDX_VERSION) {
		throw new Error(`SPDX document must use ${EXPECTED_SPDX_VERSION}.`);
	}
	if (sbom.dataLicense !== EXPECTED_DOCUMENT_LICENSE) {
		throw new Error(`SPDX document must use ${EXPECTED_DOCUMENT_LICENSE} as its document license.`);
	}
	if (sbom.SPDXID !== "SPDXRef-DOCUMENT") {
		throw new Error("SPDX document must use SPDXRef-DOCUMENT as its identifier.");
	}
	if (typeof sbom.name !== "string" || sbom.name.trim().length === 0) {
		throw new Error("SPDX document must have a non-empty name.");
	}
	if (typeof sbom.documentNamespace !== "string" || sbom.documentNamespace.length === 0) {
		throw new Error("SPDX document must have a non-empty document namespace.");
	}
	const creationInfo = assertRecord(sbom.creationInfo, "SPDX creation information");
	if (typeof creationInfo.created !== "string" ||
		!Number.isFinite(Date.parse(creationInfo.created))) {
		throw new Error("SPDX creation information must have a valid created timestamp.");
	}
	if (!Array.isArray(creationInfo.creators) || creationInfo.creators.length === 0 ||
		creationInfo.creators.some((creator) =>
			typeof creator !== "string" || creator.trim().length === 0)) {
		throw new Error("SPDX creation information must have non-empty creators.");
	}
	if (packageJson.license !== EXPECTED_PACKAGE_LICENSE) {
		throw new Error(`Package manifest must declare ${EXPECTED_PACKAGE_LICENSE}.`);
	}

	if (!Array.isArray(sbom.packages) || sbom.packages.length !== 1) {
		const count = Array.isArray(sbom.packages) ? sbom.packages.length : 0;
		throw new Error(`Runtime SPDX document must contain exactly one package; found ${String(count)}.`);
	}

	const runtimePackage = assertRecord(sbom.packages[0], "Runtime SPDX package");
	if (runtimePackage.name !== packageJson.name || runtimePackage.versionInfo !== packageJson.version) {
		throw new Error(`Runtime SPDX package must match ${packageJson.name}@${packageJson.version}.`);
	}
	if (runtimePackage.licenseDeclared !== EXPECTED_PACKAGE_LICENSE) {
		throw new Error(`Runtime SPDX package must declare ${EXPECTED_PACKAGE_LICENSE}.`);
	}
	if (typeof runtimePackage.SPDXID !== "string" || runtimePackage.SPDXID.length === 0) {
		throw new Error("Runtime SPDX package must have a non-empty SPDX identifier.");
	}

	const expectedPurl = npmPurl(packageJson.name, packageJson.version);
	const externalReferences = Array.isArray(runtimePackage.externalRefs)
		? runtimePackage.externalRefs
		: [];
	const hasNpmPurl = externalReferences.some((referenceValue) => {
		const reference = assertRecord(referenceValue, "SPDX external reference");
		return reference.referenceCategory === "PACKAGE-MANAGER" &&
			reference.referenceType === "purl" &&
			reference.referenceLocator === expectedPurl;
	});
	if (!hasNpmPurl) {
		throw new Error(`Runtime SPDX package must declare npm purl ${expectedPurl}.`);
	}

	if (!Array.isArray(sbom.documentDescribes) ||
		sbom.documentDescribes.length !== 1 ||
		sbom.documentDescribes[0] !== runtimePackage.SPDXID) {
		throw new Error("SPDX documentDescribes must identify exactly the runtime package.");
	}

	const relationships = Array.isArray(sbom.relationships) ? sbom.relationships : [];
	const describesRelationships = relationships.filter((relationshipValue) => {
		const relationship = assertRecord(relationshipValue, "SPDX relationship");
		return relationship.spdxElementId === sbom.SPDXID &&
			relationship.relatedSpdxElement === runtimePackage.SPDXID &&
			relationship.relationshipType === "DESCRIBES";
	});
	if (describesRelationships.length !== 1) {
		throw new Error("SPDX document must contain exactly one document-to-package DESCRIBES relationship.");
	}
}

function usageError(message) {
	return new Error(`${message}\n${USAGE}`);
}

function parseArguments(arguments_) {
	if (arguments_.length === 0) {
		return { emitJson: false };
	}

	let emitJson = false;
	let sourceCommit;
	let sourceDateEpochText;
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--json") {
			if (emitJson) {
				throw usageError("--json may be specified only once.");
			}
			emitJson = true;
			continue;
		}

		if (argument !== "--source-commit" && argument !== "--source-date-epoch") {
			throw usageError(`Unknown argument ${String(argument)}.`);
		}
		const value = arguments_[index + 1];
		if (value === undefined || value.startsWith("--")) {
			throw usageError(`${argument} requires a value.`);
		}
		index += 1;
		if (argument === "--source-commit") {
			if (sourceCommit !== undefined) {
				throw usageError("--source-commit may be specified only once.");
			}
			sourceCommit = value;
		} else {
			if (sourceDateEpochText !== undefined) {
				throw usageError("--source-date-epoch may be specified only once.");
			}
			sourceDateEpochText = value;
		}
	}

	if (!emitJson || sourceCommit === undefined || sourceDateEpochText === undefined) {
		throw usageError("JSON mode requires --source-commit and --source-date-epoch.");
	}
	if (!FULL_GIT_SHA_PATTERN.test(sourceCommit)) {
		throw usageError("--source-commit must be a full lowercase 40-character Git SHA.");
	}
	if (!/^(?:0|[1-9][0-9]*)$/u.test(sourceDateEpochText)) {
		throw usageError("--source-date-epoch must be a nonnegative integer.");
	}
	const sourceDateEpoch = Number(sourceDateEpochText);
	const sourceDate = new Date(sourceDateEpoch * 1000);
	if (!Number.isSafeInteger(sourceDateEpoch) || !Number.isFinite(sourceDate.getTime())) {
		throw usageError("--source-date-epoch must be a representable nonnegative integer.");
	}

	return { emitJson, sourceCommit, sourceDate };
}

function sortObjectKeys(value) {
	if (Array.isArray(value)) {
		return value.map((entry) => sortObjectKeys(entry));
	}
	if (value === null || typeof value !== "object") {
		return value;
	}

	const entries = Object.entries(value).sort(([left], [right]) => {
		if (left < right) {
			return -1;
		}
		return left > right ? 1 : 0;
	});
	return Object.fromEntries(entries.map(([key, entry]) => [key, sortObjectKeys(entry)]));
}

function canonicalizeSbom(sbomValue, packageJson, sourceCommit, sourceDate) {
	const sbom = assertRecord(sbomValue, "SPDX document");
	const creationInfo = assertRecord(sbom.creationInfo, "SPDX creation information");
	return sortObjectKeys({
		...sbom,
		documentNamespace: `${SOURCE_REPOSITORY}#spdx-${packageJson.version}-${sourceCommit}`,
		creationInfo: {
			...creationInfo,
			created: sourceDate.toISOString()
		}
	});
}

const options = parseArguments(process.argv.slice(2));

const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
const result = await runNpm([
	"sbom",
	"--sbom-format=spdx",
	"--omit=dev"
], { capture: true });
const sbom = JSON.parse(result.stdout);

validateSbom(sbom, packageJson);

if (options.emitJson) {
	const canonicalSbom = canonicalizeSbom(
		sbom,
		packageJson,
		options.sourceCommit,
		options.sourceDate
	);
	validateSbom(canonicalSbom, packageJson);
	process.stdout.write(`${JSON.stringify(canonicalSbom, null, 2)}\n`);
} else {
	console.log(
		`SPDX 2.3 SBOM describes only ${packageJson.name}@${packageJson.version} under ${EXPECTED_PACKAGE_LICENSE}.`
	);
}
