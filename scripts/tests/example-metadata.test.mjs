import assert from "node:assert/strict";
import test from "node:test";

import {
	createExampleMetadata,
	parseExampleMetadata,
	resolveExampleSourceCommit,
	serializeExampleMetadata
} from "../lib/example-metadata.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

void test("local source provenance does not claim an exact commit for a dirty build", () => {
	assert.equal(resolveExampleSourceCommit({
		channel: "local",
		explicitCommit: undefined,
		headCommit: COMMIT,
		workingTreeDirty: true
	}), null);
	assert.equal(resolveExampleSourceCommit({
		channel: "local",
		explicitCommit: undefined,
		headCommit: COMMIT,
		workingTreeDirty: false
	}), COMMIT);
	assert.equal(resolveExampleSourceCommit({
		channel: "main",
		explicitCommit: undefined,
		headCommit: COMMIT,
		workingTreeDirty: true
	}), COMMIT);
	assert.equal(resolveExampleSourceCommit({
		channel: "local",
		explicitCommit: COMMIT,
		headCommit: null,
		workingTreeDirty: true
	}), COMMIT);
});

void test("example metadata accepts local and deployment identities", () => {
	assert.deepEqual(
		createExampleMetadata({ channel: "local", commit: null, version: "0.1.0-alpha.0" }),
		{ channel: "local", commit: null, version: "0.1.0-alpha.0" }
	);
	assert.deepEqual(
		createExampleMetadata({ channel: "main", commit: COMMIT, version: "0.1.0-alpha.0" }),
		{ channel: "main", commit: COMMIT, version: "0.1.0-alpha.0" }
	);
	assert.deepEqual(
		createExampleMetadata({ channel: "release", commit: COMMIT, version: "1.0.0" }),
		{ channel: "release", commit: COMMIT, version: "1.0.0" }
	);
});

void test("example metadata rejects ambiguous deployment identities", () => {
	assert.throws(
		() => createExampleMetadata({ channel: "preview", commit: COMMIT, version: "1.0.0" }),
		/channel must be local, main, or release/u
	);
	assert.throws(
		() => createExampleMetadata({ channel: "main", commit: null, version: "1.0.0" }),
		/requires a full lowercase Git SHA/u
	);
	assert.throws(
		() => createExampleMetadata({
			channel: "release",
			commit: COMMIT.toUpperCase(),
			version: "1.0.0"
		}),
		/full lowercase Git SHA/u
	);
	assert.throws(
		() => createExampleMetadata({ channel: "local", commit: COMMIT, version: "bad version" }),
		/compact package-version identifier/u
	);
});

void test("example metadata serialization has one strict stable shape", () => {
	const metadata = createExampleMetadata({
		channel: "release",
		commit: COMMIT,
		version: "1.0.0"
	});
	const serialized = serializeExampleMetadata(metadata);
	assert.equal(
		serialized,
		'{\n\t"version": "1.0.0",\n\t"commit": "0123456789abcdef0123456789abcdef01234567",\n\t"channel": "release"\n}\n'
	);
	assert.deepEqual(parseExampleMetadata(JSON.parse(serialized)), metadata);
	assert.throws(
		() => parseExampleMetadata({ ...metadata, generatedAt: "2026-08-24T00:00:00Z" }),
		/must contain exactly/u
	);
});
