import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, runNpm } from "./lib/process.mjs";

const EXPECTED_SPDX_VERSION = "SPDX-2.3";
const EXPECTED_DOCUMENT_LICENSE = "CC0-1.0";
const EXPECTED_PACKAGE_LICENSE = "MIT";

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

const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--json")) {
	throw new Error("Usage: node scripts/check-sbom.mjs [--json]");
}
const emitJson = arguments_.length === 1;

const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
const result = await runNpm([
	"sbom",
	"--sbom-format=spdx",
	"--omit=dev"
], { capture: true });
const sbom = JSON.parse(result.stdout);

validateSbom(sbom, packageJson);

if (emitJson) {
	process.stdout.write(`${JSON.stringify(sbom, null, 2)}\n`);
} else {
	console.log(
		`SPDX 2.3 SBOM describes only ${packageJson.name}@${packageJson.version} under ${EXPECTED_PACKAGE_LICENSE}.`
	);
}
