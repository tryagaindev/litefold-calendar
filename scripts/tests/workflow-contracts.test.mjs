import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { REPOSITORY_ROOT } from "../lib/process.mjs";

const WORKFLOW_DIRECTORY = join(REPOSITORY_ROOT, ".github", "workflows");
const execFileAsync = promisify(execFile);

function workflow(name) {
	return readFile(join(WORKFLOW_DIRECTORY, name), "utf8");
}

function job(source, name) {
	const start = source.indexOf(`\n  ${name}:\n`);
	assert.notEqual(start, -1, `Expected workflow job ${name}.`);
	const remainder = source.slice(start + 1);
	const next = /^ {2}[a-z0-9][a-z0-9-]*:\s*$/gmu;
	next.lastIndex = name.length + 4;
	const match = next.exec(remainder);
	return match === null ? remainder : remainder.slice(0, match.index);
}

function trigger(source) {
	const end = source.indexOf("\npermissions:\n");
	assert.notEqual(end, -1);
	return source.slice(0, end);
}

function occurrences(source, pattern) {
	return [...source.matchAll(pattern)].length;
}

void test("release preparation creates only the reviewed three-file branch", async () => {
	const source = await workflow("prepare-alpha.yml");
	const prepare = job(source, "prepare");
	const createBranch = job(source, "create-branch");
	assert.match(trigger(source), /workflow_dispatch:[\s\S]*?Continue alpha[\s\S]*?Next patch alpha[\s\S]*?Next minor alpha/u);
	assert.match(prepare, /permissions:[\s\S]*?contents: read/u);
	assert.match(prepare, /persist-credentials: false[\s\S]*?ref: \$\{\{ github\.sha \}\}/u);
	assert.match(prepare, /npm run release:prepare -- --bump "\$\{bump\}" --json/u);
	assert.match(prepare, /expected=\(CHANGELOG\.md package-lock\.json package\.json\)/u);
	assert.match(prepare, /npm run release:verify[\s\S]*?--tag-state absent/u);
	assert.match(prepare, /branch="release\/v\$\{version\}"/u);
	assert.doesNotMatch(prepare, /GH_TOKEN|contents: write|git push/u);
	assert.match(createBranch, /permissions:[\s\S]*?actions: read[\s\S]*?contents: write/u);
	assert.doesNotMatch(createBranch, /actions\/checkout@|npm ci|npm run |node scripts\//u);
	assert.match(createBranch, /git -C "\$\{repository\}" -c credential\.helper= fetch[\s\S]*?"\$\{LFC_SOURCE_COMMIT\}"/u);
	assert.match(createBranch, /expected=\(CHANGELOG\.md package-lock\.json package\.json\)/u);
	assert.match(createBranch, /GH_TOKEN: \$\{\{ github\.token \}\}[\s\S]*?gh auth setup-git[\s\S]*?git push origin/u);
	assert.doesNotMatch(source, /--online|NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.|git push[^\n]*--force/u);
});

void test("alpha publication is classified from the exact push to main", async () => {
	const source = await workflow("publish-alpha.yml");
	const event = trigger(source);
	const classify = job(source, "classify");
	const verify = job(source, "verify");
	assert.match(event, /push:[\s\S]*?branches:[\s\S]*?- main[\s\S]*?paths:[\s\S]*?- \.github\/workflows\/publish-alpha\.yml[\s\S]*?- CHANGELOG\.md[\s\S]*?- package-lock\.json[\s\S]*?- package\.json/u);
	assert.doesNotMatch(event, /workflow_run:|workflow_dispatch:|release:/u);
	assert.match(classify, /LFC_SOURCE_COMMIT: \$\{\{ github\.sha \}\}/u);
	assert.match(classify, /fetch-depth: 2[\s\S]*?persist-credentials: false/u);
	assert.match(classify, /git rev-parse --verify HEAD\^1/u);
	assert.match(classify, /git show "\$\{parent_commit\}:package\.json"/u);
	assert.match(classify, /candidate_version[\s\S]*?parent_version[\s\S]*?eligible=true/u);
	assert.doesNotMatch(classify, /GH_TOKEN|gh api|origin\/main/u);
	assert.match(verify, /ref: \$\{\{ github\.sha \}\}/u);
	assert.match(verify, /persist-credentials: false/u);
	assert.match(verify, /git show HEAD\^1:package\.json/u);
	assert.match(verify, /git diff --name-only HEAD\^1 HEAD/u);
	assert.match(verify, /expected_files=\(CHANGELOG\.md package-lock\.json package\.json\)/u);
	assert.match(verify, /npm run release:verify[\s\S]*?--commit "\$\{source_commit\}"[\s\S]*?--require-clean/u);
	assert.match(verify, /registry_raw="\$\{RUNNER_TEMP\}\/registry\.raw\.json"/u);
	assert.match(verify, /registry_json="\$\{RUNNER_TEMP\}\/registry\.json"/u);
	assert.match(verify, /registry_error="\$\{RUNNER_TEMP\}\/registry\.err"/u);
	assert.match(verify, /> "\$\{registry_raw\}" 2> "\$\{registry_error\}"/u);
	assert.match(
		verify,
		/LFC_NORMALIZE_NPM_VIEW_JSON\}"[\s\S]*?"\$\{registry_raw\}" "\$\{registry_json\}"/u
	);
	assert.equal(occurrences(verify, /registry\.raw\.json/gu), 1);
	assert.equal(occurrences(verify, /registry\.json/gu), 1);
	assert.equal(occurrences(verify, /registry\.err/gu), 1);
	assert.match(verify, /npm run check/u);
	assert.match(verify, /npm run package/u);
});

void test("the OIDC publisher consumes only the verified five-file bundle", async () => {
	const source = await workflow("publish-alpha.yml");
	const publish = job(source, "publish");
	assert.match(publish, /environment: npm/u);
	assert.match(publish, /id-token: write/u);
	assert.equal(occurrences(source, /^\s*environment: npm$/gmu), 1);
	assert.equal(occurrences(source, /^\s*id-token: write$/gmu), 1);
	assert.equal(occurrences(publish, /actions\/download-artifact@/gu), 1);
	assert.match(publish, /find \.[\s\S]*?wc -l\)" -eq 5/u);
	assert.match(publish, /test -z "\$\(find \.[\s\S]*?! -type f/u);
	assert.match(publish, /sha256sum --check --strict SHA256SUMS/u);
	assert.match(publish, /E404\|404 Not Found[\s\S]*?package is (?:still )?absent/u);
	assert.match(
		publish,
		/const forbiddenDependencyFields = \[\s*"dependencies",\s*"peerDependencies",\s*"peerDependenciesMeta",\s*"optionalDependencies",\s*"bundledDependencies",\s*"bundleDependencies"\s*\]/u
	);
	assert.match(
		publish,
		/forbiddenDependencyFields\.some\(\(field\) => Object\.hasOwn\(manifest, field\)\)/u
	);
	assert.equal(occurrences(publish, /^\s*npm publish\b/gmu), 1);
	assert.match(publish, /--registry https:\/\/registry\.npmjs\.org\/[\s\S]*?--access public[\s\S]*?--tag alpha[\s\S]*?--provenance[\s\S]*?--ignore-scripts/u);
	assert.match(publish, /manifest\.publishConfig\?\.tag !== "alpha"/u);
	assert.doesNotMatch(publish, /actions\/checkout@|npm ci|npm run |node scripts\//u);
	assert.doesNotMatch(publish, /LFC_PARENT_VERSION|releases\/tags\/v\$\{LFC_PARENT_VERSION\}/u);
	assert.doesNotMatch(source, /NPM_TOKEN|NODE_AUTH_TOKEN|registry-release-state\.mjs|release-verification\.mjs|verify-release-state\.mjs/u);
});

void test("first-publication candidates share one lock and only current main may claim npm E404", async () => {
	const source = await workflow("publish-alpha.yml");
	const publish = job(source, "publish");
	assert.match(
		source,
		/^concurrency:\s*\n\s*group: npm-alpha-\$\{\{ github\.repository \}\}\s*\n\s*queue: max\s*\n\s*cancel-in-progress: false/mu
	);
	assert.doesNotMatch(publish, /^\s*concurrency:|group:[^\n]*(?:version|needs\.verify)/mu);
	assert.equal(
		occurrences(publish, /repos\/\$\{GITHUB_REPOSITORY\}\/contents\/package\.json\?ref=main/gu),
		2
	);
	assert.equal(
		occurrences(publish, /"\$\{main_version\}" != "\$\{LFC_VERSION\}"/gu),
		2
	);

	const currentMainVersion = "0.2.0-alpha.1";
	const queuedCandidates = ["0.2.0-alpha.0", currentMainVersion];
	assert.deepEqual(
		queuedCandidates.map((candidate) => candidate === currentMainVersion),
		[false, true]
	);
});

void test("npm 12 view results pass through one fail-closed normalizer", async () => {
	const source = await workflow("publish-alpha.yml");
	const verifyRegistry = job(source, "verify-registry");
	assert.match(
		source,
		/LFC_NORMALIZE_NPM_VIEW_JSON: >-[\s\S]*?!Array\.isArray\(value\) \|\| value\.length !== 1[\s\S]*?JSON\.stringify\(value\[0\]\)/u
	);
	assert.equal(occurrences(source, /^\s*(?:if )?npm view\b/gmu), 6);
	assert.equal(
		occurrences(
			source,
		/node --input-type=module --eval "\$\{LFC_NORMALIZE_NPM_VIEW_JSON\}"/gu
		),
		6
	);
	assert.doesNotMatch(source, /jq[^\n]*\.raw\.json|JSON\.parse\([^\n]*\.raw\.json/u);

	const propagationLoop = /for attempt in \$\(seq 1 60\); do([\s\S]*?)\n\s*done/u.exec(
		verifyRegistry
	)?.[1];
	assert.equal(typeof propagationLoop, "string");
	const integrityView = propagationLoop.indexOf("npm view \"@tryagaindev/litefold-calendar@${LFC_VERSION}\"");
	const integrityNormalize = propagationLoop.indexOf(
		'"${integrity_raw}" "${integrity_json}"'
	);
	const tagsView = propagationLoop.indexOf(
		"npm view @tryagaindev/litefold-calendar dist-tags"
	);
	const tagsNormalize = propagationLoop.indexOf('"${tags_raw}" "${tags_json}"');
	assert.ok(integrityView >= 0 && integrityView < integrityNormalize);
	assert.ok(integrityNormalize < tagsView);
	assert.ok(tagsView < tagsNormalize);
	assert.doesNotMatch(propagationLoop, /> "\$\{integrity_raw\}"[^;\n]*&&/u);
});

void test("greater-alpha recovery follows the published alpha tag rather than the manifest parent", async (context) => {
	const repository = await mkdtemp(join(tmpdir(), "lfc-workflow-lineage-"));
	context.after(() => rm(repository, { force: true, recursive: true }));
	const git = (...arguments_) => execFileAsync("git", arguments_, { cwd: repository });
	await git("init", "--initial-branch=main");
	await git("config", "user.name", "Workflow Test");
	await git("config", "user.email", "workflow-test@example.invalid");
	await writeFile(join(repository, "package.json"), '{"version":"0.2.0-alpha.0"}\n', "utf8");
	await git("add", "package.json");
	await git("commit", "-m", "previous alpha");
	await git("tag", "--annotate", "v0.2.0-alpha.0", "--message", "previous alpha");
	const { stdout: releaseOutput } = await git("rev-parse", "v0.2.0-alpha.0^{commit}");
	const releaseCommit = releaseOutput.trim();
	await writeFile(join(repository, "package.json"), '{"version":"0.2.0-alpha.1"}\n', "utf8");
	await git("add", "package.json");
	await git("commit", "-m", "skipped alpha");
	await writeFile(join(repository, "package.json"), '{"version":"0.2.0-alpha.2"}\n', "utf8");
	await git("add", "package.json");
	await git("commit", "-m", "recovery alpha");
	const { stdout: parentOutput } = await git("rev-parse", "HEAD^1");
	assert.notEqual(releaseCommit, parentOutput.trim());
	await git("merge-base", "--is-ancestor", releaseCommit, "HEAD");

	const publish = job(await workflow("publish-alpha.yml"), "publish");
	assert.doesNotMatch(publish, /LFC_PARENT_(?:COMMIT|VERSION)|releases\/tags\//u);
	assert.match(
		publish,
		/registry_alpha="\$\(jq[\s\S]*?git\/ref\/tags\/v\$\{registry_alpha\}[\s\S]*?git\/tags\/\$\{tag_object\}[\s\S]*?compare\/\$\{registry_alpha_commit\}\.\.\.\$\{LFC_SOURCE_COMMIT\}/u
	);
	assert.match(
		publish,
		/\$\{registry_alpha\}" == "0\.1\.0-alpha\.0"[\s\S]*?\$\{tag_object_type\}" == "commit"[\s\S]*?\$\{tag_object\}" == "17d8db664834d8e6e8ded8689df404827c11bfa3"/u
	);
	assert.match(publish, /only the exact historical v0\.1\.0-alpha\.0 tag is exempt/u);
	assert.match(publish, /\.status == "ahead" or \.status == "identical"/u);
});

void test("publisher authorization is bound to one verified registry snapshot", async () => {
	const source = await workflow("publish-alpha.yml");
	const verify = job(source, "verify");
	const publish = job(source, "publish");
	assert.match(verify, /registry-state-sha256: \$\{\{ steps\.registry-state\.outputs\.registry-state-sha256 \}\}/u);
	assert.match(verify, /printf 'registry-state-sha256=%s\\n' "\$\{registry_state_sha256\}"/u);
	assert.equal(
		occurrences(publish, /LFC_REGISTRY_STATE_SHA256: \$\{\{ needs\.verify\.outputs\.registry-state-sha256 \}\}/gu),
		2
	);
	assert.equal(
		occurrences(publish, /"\$\{registry_state_sha256\}" != "\$\{LFC_REGISTRY_STATE_SHA256\}"/gu),
		2
	);
	assert.match(publish, /registry state changed after exact-source verification/u);
	assert.match(publish, /registry state changed immediately before publication/u);
});

void test("release bundle digest lines become explicit jq entries", async () => {
	const source = await workflow("publish-alpha.yml");
	const stage = job(source, "stage-release");
	const publish = job(source, "publish");
	const corrected =
		/jq --raw-input --slurp 'split\("\\n"\) \| map\(select\(length > 0\) \| split\("\\t"\) \| \{key: \.\[0\], value: \.\[1\]\}\) \| from_entries'/u;
	const broken =
		/map\(select\(length > 0\) \| split\("\\t"\)\) \| from_entries/u;

	assert.match(stage, corrected);
	assert.match(publish, corrected);
	assert.equal(occurrences(source, new RegExp(corrected.source, "gu")), 2);
	assert.doesNotMatch(source, broken);
});

void test("draft assets and final release publication are digest-bound and source-free", async () => {
	const source = await workflow("publish-alpha.yml");
	const stage = job(source, "stage-release");
	const verifyRegistry = job(source, "verify-registry");
	const publishRelease = job(source, "publish-release");
	assert.match(stage, /contents: write/u);
	assert.doesNotMatch(stage, /actions\/checkout@|npm ci|npm run |node scripts\//u);
	assert.match(stage, /LFC_ASSET_DIGESTS: \$\{\{ needs\.verify\.outputs\.asset-digests \}\}/u);
	assert.match(stage, /\.digest[\s\S]*?sha256:/u);
	assert.match(stage, /-F draft=true -F prerelease=true/u);
	assert.match(stage, /release\.draft === false && release\.immutable !== true/u);
	assert.match(verifyRegistry, /needs:[\s\S]*?- publish/u);
	assert.match(verifyRegistry, /actions\/download-artifact@[0-9a-f]{40}[\s\S]*?needs\.verify\.outputs\.bundle-artifact/u);
	assert.match(verifyRegistry, /LFC_TARBALL: \$\{\{ runner\.temp \}\}\/release-bundle\/\$\{\{ needs\.verify\.outputs\.bundle-name \}\}\.tgz/u);
	assert.match(verifyRegistry, /retained_integrity[\s\S]*?LFC_EXPECTED_INTEGRITY/u);
	assert.match(verifyRegistry, /npm install --prefix "\$\{consumer\}" --ignore-scripts[\s\S]*?"@tryagaindev\/litefold-calendar@\$\{LFC_VERSION\}"/u);
	assert.match(verifyRegistry, /diff -u <\(printf '%s\\n' '@tryagaindev'\)[\s\S]*?diff -u <\(printf '%s\\n' 'litefold-calendar'\)/u);
	assert.match(verifyRegistry, /test ! -e "\$\{consumer\}\/node_modules\/@tryagaindev\/litefold-calendar\/node_modules"/u);
	assert.match(verifyRegistry, /npm audit signatures/u);
	assert.match(verifyRegistry, /LFC_PROVENANCE_EXTRACT_START[\s\S]*?exactly one SLSA v1 provenance bundle[\s\S]*?provenance\.sigstore\.json/u);
	assert.match(source, /^\s*LFC_GH_MIN_VERSION: "2\.96\.0"$/mu);
	assert.match(
		verifyRegistry,
		/gh --version[\s\S]*?LFC_GH_VERSION_POLICY_START[\s\S]*?GitHub CLI \$\{process\.env\.LFC_GH_MIN_VERSION\} or newer is required[\s\S]*?gh attestation verify "\$\{LFC_TARBALL\}"[\s\S]*?--bundle provenance\.sigstore\.json[\s\S]*?--cert-identity[\s\S]*?--source-ref refs\/heads\/main[\s\S]*?--source-digest "\$\{LFC_SOURCE_COMMIT\}"[\s\S]*?--signer-digest "\$\{LFC_SOURCE_COMMIT\}"[\s\S]*?--deny-self-hosted-runners[\s\S]*?--digest-alg sha512[\s\S]*?--predicate-type https:\/\/slsa\.dev\/provenance\/v1/u
	);
	assert.match(
		verifyRegistry,
		/LFC_PROVENANCE_POLICY_START[\s\S]*?sourceRepositoryVisibilityAtSigning === "public"/u
	);
	assert.match(verifyRegistry, /"\$\{alpha\}" == "\$\{LFC_VERSION\}"[\s\S]*?"\$\{latest\}" == "\$\{LFC_VERSION\}"/u);
	assert.doesNotMatch(verifyRegistry, /actions\/checkout@|GH_TOKEN|contents: write|id-token: write|npm publish/u);
	assert.match(publishRelease, /needs:[\s\S]*?- stage-release[\s\S]*?- verify-registry/u);
	assert.match(publishRelease, /LFC_ASSET_DIGESTS: \$\{\{ needs\.verify\.outputs\.asset-digests \}\}/u);
	assert.match(publishRelease, /validate_tag\(\)[\s\S]*?target\.target\.oid == \$commit/u);
	assert.match(publishRelease, /validate_release\(\)[\s\S]*?release\.target_commitish !== process\.env\.LFC_SOURCE_COMMIT/u);
	assert.match(publishRelease, /digest !== process\.env\.LFC_NOTES_SHA256/u);
	assert.match(publishRelease, /release\.draft !== false \|\| release\.immutable !== true/u);
	assert.match(publishRelease, /\(\.assets \| length\) == \(\$expected \| length\)[\s\S]*?\.digest \| sub\("\^sha256:"; ""\)/u);
	assert.match(
		publishRelease,
		/validate_tag[\s\S]*?validate_release "\$\{release\}" false[\s\S]*?-F draft=false[\s\S]*?validate_tag[\s\S]*?validate_release "\$\{final\}" true/u
	);
	assert.doesNotMatch(publishRelease, /actions\/checkout@|actions\/download-artifact@|npm |node scripts\//u);
});

void test("the publisher relies on the native downstream workflow handoff", async () => {
	const source = await workflow("publish-alpha.yml");
	assert.doesNotMatch(source, /dispatch-release-pages|gh workflow run|actions: write/u);
	assert.match(
		source,
		/Release Pages: `Deploy static examples` starts after this workflow completes successfully/u
	);
});

void test("automatic Pages deployment is workflow-run-only and exact-source", async () => {
	const source = await workflow("deploy-examples.yml");
	const event = trigger(source);
	const build = job(source, "build");
	const update = job(source, "update-snapshot");
	const packageSite = job(source, "package-site");
	const deploy = job(source, "deploy");
	assert.match(event, /workflow_run:[\s\S]*?- CI[\s\S]*?- Publish npm alpha[\s\S]*?branches:\s*\n\s+- main/u);
	assert.doesNotMatch(event, /workflow_dispatch:|snapshot_ref:/u);
	assert.doesNotMatch(source, /^ {2}(?:prepare-rollback|rollback-snapshot):/mu);
	assert.doesNotMatch(source, /^ {2}classify:/mu);
	assert.match(
		source,
		/^concurrency:\s*\n\s*group: static-examples-deploy-\$\{\{ github\.repository \}\}\s*\n\s*queue: max\s*\n\s*cancel-in-progress: false/mu
	);
	assert.equal(occurrences(source, /group: static-examples-deploy-\$\{\{ github\.repository \}\}/gu), 1);
	assert.match(
		build,
		/github\.event_name == 'workflow_run'[\s\S]*?conclusion == 'success'[\s\S]*?event == 'push'[\s\S]*?head_branch == 'main'[\s\S]*?head_repository\.full_name == github\.repository/u
	);
	assert.match(build, /outputs:[\s\S]*?eligible: \$\{\{ steps\.identity\.outputs\.eligible \}\}[\s\S]*?source-commit: \$\{\{ steps\.identity\.outputs\.source-commit \}\}/u);
	assert.match(build, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/u);
	assert.match(build, /source_commit="\$\(git rev-parse --verify HEAD\^\{commit\}\)"[\s\S]*?test "\$\{source_commit\}" = "\$\{LFC_WORKFLOW_RUN_SHA\}"[\s\S]*?git merge-base --is-ancestor "\$\{source_commit\}" origin\/main/u);
	assert.match(build, /LFC_UPSTREAM_WORKFLOW: \$\{\{ github\.event\.workflow_run\.name \}\}[\s\S]*?LFC_UPSTREAM_WORKFLOW_PATH: \$\{\{ github\.event\.workflow_run\.path \}\}/u);
	assert.match(build, /upstream_workflow_path="\$\{LFC_UPSTREAM_WORKFLOW_PATH%@\*\}"/u);
	assert.match(build, /LFC_UPSTREAM_WORKFLOW\}" == "CI" &&[\s\S]*?upstream_workflow_path\}" == "\.github\/workflows\/ci\.yml"[\s\S]*?channel="main"/u);
	assert.match(build, /LFC_UPSTREAM_WORKFLOW\}" == "Publish npm alpha" &&[\s\S]*?upstream_workflow_path\}" == "\.github\/workflows\/publish-alpha\.yml"[\s\S]*?parent_version[\s\S]*?eligible=false[\s\S]*?channel="release"/u);
	assert.match(build, /Unexpected upstream workflow identity:[\s\S]*?LFC_UPSTREAM_WORKFLOW_PATH/u);
	assert.match(build, /eligible.*channel.*release[\s\S]*?release_ref="v\$\{version\}"[\s\S]*?\^0\\\.\[0-9\]\+\\\.\[0-9\]\+-alpha\\\.\[0-9\]\+\$[\s\S]*?release_ref\}\^\{commit\}[\s\S]*?= "\$\{source_commit\}"/u);
	assert.match(build, /Resolve the deployment identity[\s\S]*?Set up exact Node[\s\S]*?Set up exact npm[\s\S]*?npm ci --ignore-scripts[\s\S]*?npm run build/u);
	assert.equal(
		occurrences(build, /^\s+if: \$\{\{ steps\.identity\.outputs\.eligible == 'true' \}\}$/gmu),
		7
	);
	assert.match(build, /releases\/tags\/\$\{release_ref\}/u);
	assert.match(build, /\.draft == false and \.prerelease == true and \.immutable == true and[\s\S]*?\.tag_name == \$tag and \.target_commitish == \$commit/u);
	assert.match(build, /printf 'eligible=%s[\s\S]*?printf 'channel=%s[\s\S]*?printf 'source-commit=%s[\s\S]*?printf 'version=%s/u);
	assert.doesNotMatch(source, /inputs\.|gh workflow run/u);
	assert.match(build, /name=pages-channel-%s-%s[\s\S]*?path: \$\{\{ runner\.temp \}\}\/pages-channel/u);
	assert.doesNotMatch(build, /assemble-pages\.mjs|pages-content|previous-pages-site/u);
	assert.match(update, /needs\.build\.outputs\.eligible == 'true'/u);
	assert.match(update, /expected_channel_entries=\(channel\.json content shell\)/u);
	assert.match(update, /for attempt in \$\(seq 1 6\)[\s\S]*?--force-with-lease=refs\/heads\/pages-content:\$\{expected_head\}/u);
	assert.match(update, /channel_input="\$\(mktemp -d\)"[\s\S]*?chmod --recursive go-w,a\+rX "\$\{channel_input\}"/u);
	assert.match(update, /state_worktree="\$\{state_parent\}\/state"[\s\S]*?git worktree add --detach/u);
	assert.match(update, /find "\$\{previous_site\}" -type l[\s\S]*?must not contain symbolic links/u);
	assert.match(update, /assembly_tooling="\$\(mktemp -d\)"[\s\S]*?cp -a -- scripts node_modules "\$\{assembly_tooling\}\/"[\s\S]*?chmod --recursive go-w,a\+rX "\$\{assembly_tooling\}"[\s\S]*?sudo --user=nobody test -r/u);
	assert.match(update, /chmod --recursive go-w,a\+rX "\$\{previous_site\}"[\s\S]*?sudo --user=nobody env --ignore-environment/u);
	assert.match(update, /sudo --user=nobody env --ignore-environment[\s\S]*?node_path[\s\S]*?assembly_tooling[\s\S]*?scripts\/assemble-pages\.mjs/u);
	assert.doesNotMatch(update, /"\$\{node_path\}" scripts\/assemble-pages\.mjs/u);
	assert.match(update, /ref: \$\{\{ needs\.build\.outputs\.source-commit \}\}[\s\S]*?git rev-parse --verify 'HEAD\^\{commit\}'[\s\S]*?LFC_SOURCE_COMMIT/u);
	assert.doesNotMatch(update, /ref: \$\{\{ github\.sha \}\}/u);
	assert.match(update, /git merge-base --is-ancestor[\s\S]*?retained_main_commit[\s\S]*?LFC_SOURCE_COMMIT/u);
	assert.match(update, /git -C "\$\{state_worktree\}" add --all/u);
	assert.match(update, /test ! -e "\$\{state_worktree\}\/node_modules"[\s\S]*?--exclude=\.git/u);
	assert.match(update, /diff --cached --quiet[\s\S]*?observed_pages_commit[\s\S]*?current_pages_commit/u);
	assert.doesNotMatch(update, /^\s+git add --all$/mu);
	assert.match(packageSite, /needs: update-snapshot[\s\S]*?needs\.update-snapshot\.outputs\.snapshot-commit/u);
	assert.doesNotMatch(packageSite, /rollback-snapshot/u);
	assert.doesNotMatch(deploy, /^\s*concurrency:/mu);
	assert.match(deploy, /current_snapshot[\s\S]*?LFC_SNAPSHOT_COMMIT[\s\S]*?actions\/deploy-pages@/u);
	assert.doesNotMatch(source, /npm publish|NPM_TOKEN|NODE_AUTH_TOKEN/u);
});

void test("manual Pages rollback is workflow-dispatch-only and preserves releases", async () => {
	const source = await workflow("rollback-examples.yml");
	const event = trigger(source);
	const rollback = job(source, "rollback-snapshot");
	const packageSite = job(source, "package-site");
	const deploy = job(source, "deploy");
	assert.match(source, /^name: Roll back static examples$/mu);
	assert.match(event, /workflow_dispatch:[\s\S]*?snapshot_ref:[\s\S]*?required: true/u);
	assert.doesNotMatch(event, /workflow_run:/u);
	assert.doesNotMatch(source, /github\.event\.workflow_run|^ {2}(?:build|prepare-rollback|update-snapshot):/mu);
	assert.match(
		source,
		/^concurrency:\s*\n\s*group: static-examples-deploy-\$\{\{ github\.repository \}\}\s*\n\s*queue: max\s*\n\s*cancel-in-progress: false/mu
	);
	assert.equal(occurrences(source, /group: static-examples-deploy-\$\{\{ github\.repository \}\}/gu), 1);
	assert.match(rollback, /github\.event_name == 'workflow_dispatch'[\s\S]*?github\.ref == 'refs\/heads\/main'/u);
	assert.doesNotMatch(rollback, /inputs\.operation/u);
	assert.match(rollback, /ref: \$\{\{ github\.sha \}\}[\s\S]*?git rev-parse --verify HEAD\^\{commit\}[\s\S]*?LFC_DISPATCH_COMMIT/u);
	assert.doesNotMatch(source, /ref: \$\{\{ inputs\.snapshot_ref \}\}/u);
	assert.match(rollback, /! "\$\{LFC_SNAPSHOT_REF\}" =~ \^\[0-9a-f\]\{40\}\$/u);
	assert.match(rollback, /git merge-base --is-ancestor "\$\{LFC_SNAPSHOT_REF\}" "\$\{pages_base_commit\}"/u);
	assert.match(rollback, /git archive --format=tar "\$\{pages_base_commit\}"[\s\S]*?previous_site[\s\S]*?git archive --format=tar "\$\{LFC_SNAPSHOT_REF\}" main[\s\S]*?rollback_channel/u);
	assert.match(rollback, /previous_site\}\/index\.html[\s\S]*?previous_site\}\/litefold-calendar-mark\.svg[\s\S]*?previous_site\}\/site\.css[\s\S]*?previous_site\}\/site\.js/u);
	assert.match(rollback, /rollback_channel\}\/content\/deployment-details\.css[\s\S]*?rollback_channel\}\/shell\/deployment-details\.css/u);
	assert.match(rollback, /assembly_tooling="\$\(mktemp -d\)"[\s\S]*?cp -a -- scripts node_modules[\s\S]*?chmod --recursive go-w,a\+rX/u);
	assert.match(rollback, /chmod --recursive go-w,a\+rX "\$\{rollback_inputs\}"[\s\S]*?sudo --user=nobody env --ignore-environment[\s\S]*?scripts\/assemble-pages\.mjs/u);
	assert.match(rollback, /candidate_snapshot[\s\S]*?must not contain symbolic links|Canonical rollback assembly produced a symbolic link/u);
	assert.match(rollback, /rollback_channel\}\/content" "\$\{candidate_site\}\/main[\s\S]*?changed or removed immutable releases/u);
	assert.match(rollback, /state_worktree="\$\{state_parent\}\/state"[\s\S]*?git worktree add --detach[\s\S]*?test ! -e "\$\{state_worktree\}\/node_modules"/u);
	assert.match(rollback, /observed_pages_commit[\s\S]*?pages_base_commit[\s\S]*?HEAD:refs\/heads\/pages-content/u);
	assert.doesNotMatch(source, /actions\/(?:upload|download)-artifact@|snapshot-artifact|scripts\/pages-site\/(?:index\.html|site\.css|site\.js)/u);
	assert.match(packageSite, /needs: rollback-snapshot[\s\S]*?needs\.rollback-snapshot\.outputs\.snapshot-commit/u);
	assert.doesNotMatch(packageSite, /update-snapshot/u);
	assert.doesNotMatch(deploy, /^\s*concurrency:/mu);
	assert.match(deploy, /current_snapshot[\s\S]*?LFC_SNAPSHOT_COMMIT[\s\S]*?actions\/deploy-pages@/u);
	assert.doesNotMatch(source, /npm publish|NPM_TOKEN|NODE_AUTH_TOKEN/u);
});

void test("automatic deployment and rollback triggers remain physically isolated", async () => {
	for (const name of ["deploy-examples.yml", "rollback-examples.yml"]) {
		const event = trigger(await workflow(name));
		assert.ok(
			!(event.includes("workflow_run:") && event.includes("workflow_dispatch:")),
			`${name} must not mix automatic and manual trust contexts.`
		);
	}
});

void test("forward repair pushes the exact reviewed HEAD", async () => {
	const guide = await readFile(
		join(REPOSITORY_ROOT, "docs", "release-administration.md"),
		"utf8"
	);
	assert.match(guide, /git rev-parse HEAD~2[\s\S]*?git rev-parse origin\/main/u);
	assert.match(guide, /git rev-list --count origin\/main\.\.HEAD[\s\S]*?-eq 2/u);
	assert.match(guide, /git log -2 --format='%ae%n%ce'[\s\S]*?6586019\+redbasi@users\.noreply\.github\.com/u);
	assert.match(guide, /git push --atomic origin HEAD:refs\/heads\/main/u);
	assert.match(guide, /git ls-remote --heads origin refs\/heads\/main/u);
	assert.doesNotMatch(guide, /git push --atomic origin main/u);
});

void test("all third-party workflow actions are pinned to full commits", async () => {
	for (const name of [
		"ci.yml",
		"deploy-examples.yml",
		"prepare-alpha.yml",
		"publish-alpha.yml",
		"rollback-examples.yml"
	]) {
		const source = await workflow(name);
		for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
			assert.match(match[1], /^[^@\s]+@[0-9a-f]{40}$/u, `${name}: ${match[1]}`);
		}
	}
});

void test("artifact downloads use the official Node 24 action", async () => {
	const workflows = [
		"deploy-examples.yml",
		"prepare-alpha.yml",
		"publish-alpha.yml",
		"rollback-examples.yml"
	];
	const expected =
		"actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1";
	let downloads = 0;
	for (const name of workflows) {
		const source = await workflow(name);
		for (const match of source.matchAll(/^\s*uses:\s*(actions\/download-artifact@[^\r\n]+)$/gmu)) {
			downloads += 1;
			assert.equal(match[1], expected, name);
		}
	}
	assert.equal(downloads, 6);
});

void test("workflow dependency caches stay disabled", async () => {
	for (const name of [
		"ci.yml",
		"deploy-examples.yml",
		"prepare-alpha.yml",
		"publish-alpha.yml",
		"rollback-examples.yml"
	]) {
		const source = await workflow(name);
		assert.doesNotMatch(source, /actions\/cache@|^\s+cache:\s*/mu, name);
		assert.equal(
			occurrences(source, /uses: actions\/setup-node@/gu),
			occurrences(source, /package-manager-cache: false/gu),
			`${name} must explicitly disable setup-node package-manager caching.`
		);
	}
});
