import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import playwrightConfiguration from "../../playwright.config.mjs";
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

void test("nightly publication uses daily and manual exact-green-main snapshots", async () => {
	const source = await workflow("publish-nightly.yml");
	const event = trigger(source);
	const classify = job(source, "classify");
	const verify = job(source, "verify");
	assert.match(event, /schedule:[\s\S]*?cron: "0 9 \* \* \*"[\s\S]*?workflow_dispatch:/u);
	assert.doesNotMatch(event, /push:|release:|workflow_run:/u);
	assert.match(classify, /github\.repository == 'tryagaindev\/litefold-calendar'[\s\S]*?refs\/heads\/main/u);
	assert.match(classify, /GITHUB_WORKFLOW_SHA[\s\S]*?GITHUB_SHA/u);
	assert.match(classify, /actions\/workflows\/ci\.yml\/runs[\s\S]*?head_sha[\s\S]*?\.conclusion == "success"/u);
	assert.match(classify, /created_at[\s\S]*?GITHUB_RUN_ID/u);
	assert.match(verify, /npm run nightly:plan[\s\S]*?nightly-plan\.json/u);
	assert.match(verify, /validateNightlyRegistryState[\s\S]*?previous-pages\.json/u);
	assert.match(verify, /npm run check/u);
	assert.match(verify, /npm run package:nightly -- --plan/u);
	assert.doesNotMatch(source, /git push|git commit|release:prepare|git diff --name-only HEAD\^1 HEAD/u);
});

void test("nightly recovery preserves original artifacts and Pages binds the originating attempt", async () => {
	const source = await workflow("publish-nightly.yml");
	const verify = job(source, "verify");
	assert.match(verify, /selectNightlyRecoveryArtifacts/u);
	assert.match(verify, /actions\/artifacts\/\$\{id\}\/zip[\s\S]*?sha256sum[\s\S]*?\$\{digest\}/u);
	assert.match(verify, /verifyRestoredNightlyBundle/u);
	assert.equal(occurrences(verify, /steps\.recovery\.outputs\.restored != 'true'/gu), 3);
	assert.match(verify, /LFC_BROWSER_TARGET_DATE[\s\S]*?LFC_CREATED_AT/u);
	assert.match(verify, /Retained notes differ from the exact source/u);
	const pages = await workflow("deploy-examples.yml");
	assert.match(pages, /LFC_UPSTREAM_RUN_ATTEMPT: \$\{\{ github\.event\.workflow_run\.run_attempt \}\}/u);
	assert.match(pages, /actions\/runs\/\$\{LFC_UPSTREAM_RUN_ID\}\/attempts\/\$\{LFC_UPSTREAM_RUN_ATTEMPT\}\/jobs/u);
});

void test("nightly publication uses only OIDC and preserves the preflight latest tag", async () => {
	const source = await workflow("publish-nightly.yml");
	const verify = job(source, "verify");
	const verifyRegistry = job(source, "verify-registry");
	assert.doesNotMatch(source, /synchronize-latest|npm-nightly-tags|NPM_TOKEN|NODE_AUTH_TOKEN|NPM_NIGHTLY_TAG_TOKEN|tokenExpiryStatus|npm dist-tag|_authToken/u);
	assert.match(verify, /registry-latest: \$\{\{ steps\.registry-state\.outputs\.registry-latest \}\}/u);
	assert.match(verify, /validateNightlyRegistryState[\s\S]*?registry-latest=\$\{state\.latest\}/u);
	assert.match(verifyRegistry, /needs:\s*\n\s+- publish\s*\n\s+- verify\s*\n/u);
	assert.match(verifyRegistry, /LFC_EXPECTED_LATEST: \$\{\{ needs\.verify\.outputs\.registry-latest \}\}/u);
	assert.match(verifyRegistry, /tags\.latest !== process\.env\.LFC_EXPECTED_LATEST/u);
	assert.doesNotMatch(verifyRegistry, /contents: write|id-token: write|npm publish/u);
});

void test("the OIDC publisher consumes only the verified five-file bundle", async () => {
	const source = await workflow("publish-nightly.yml");
	const publish = job(source, "publish");
	assert.match(publish, /environment: npm-nightly/u);
	assert.match(publish, /id-token: write/u);
	assert.equal(occurrences(source, /^\s*environment: npm-nightly$/gmu), 1);
	assert.equal(occurrences(source, /^\s*id-token: write$/gmu), 1);
	assert.equal(occurrences(publish, /actions\/download-artifact@/gu), 1);
	assert.match(publish, /find \.[\s\S]*?wc -l\)" -eq 5/u);
	assert.match(publish, /test -z "\$\(find \.[\s\S]*?! -type f/u);
	assert.match(publish, /sha256sum --check --strict SHA256SUMS/u);
	assert.match(
		publish,
		/E404\|404 Not Found[\s\S]*?npm package disappeared immediately before publication/u
	);
	assert.match(
		publish,
		/const forbiddenDependencyFields = \[\s*"dependencies",\s*"peerDependencies",\s*"peerDependenciesMeta",\s*"optionalDependencies",\s*"bundledDependencies",\s*"bundleDependencies"\s*\]/u
	);
	assert.match(
		publish,
		/forbiddenDependencyFields\.some\(\(field\) => Object\.hasOwn\(manifest, field\)\)/u
	);
	assert.equal(occurrences(publish, /^\s*npm publish\b/gmu), 1);
	assert.match(publish, /--registry https:\/\/registry\.npmjs\.org\/[\s\S]*?--access public[\s\S]*?--tag nightly[\s\S]*?--provenance[\s\S]*?--ignore-scripts/u);
	assert.match(publish, /manifest\.publishConfig\?\.tag !== "nightly"/u);
	assert.doesNotMatch(publish, /actions\/checkout@|npm ci|npm run |node scripts\//u);
	assert.doesNotMatch(publish, /LFC_PARENT_VERSION|releases\/tags\/v\$\{LFC_PARENT_VERSION\}/u);
	assert.doesNotMatch(publish, /NPM_TOKEN|NODE_AUTH_TOKEN|registry-release-state\.mjs|release-verification\.mjs|verify-release-state\.mjs/u);
});

void test("registry-backed candidates share one lock and only current main may publish", async () => {
	const source = await workflow("publish-nightly.yml");
	const verify = job(source, "verify");
	const publish = job(source, "publish");
	assert.match(
		source,
		/^concurrency:\s*\n\s*group: npm-nightly-\$\{\{ github\.repository \}\}\s*\n\s*queue: max\s*\n\s*cancel-in-progress: false/mu
	);
	assert.doesNotMatch(publish, /^\s*concurrency:|group:[^\n]*(?:version|needs\.verify)/mu);
	assert.equal(
		occurrences(publish, /repos\/\$\{GITHUB_REPOSITORY\}\/contents\/package\.json\?ref=\$\{main_commit\}/gu),
		2
	);
	assert.equal(
		occurrences(publish, /"\$\{main_version\}" != "\$\{LFC_BASE_VERSION\}"/gu),
		2
	);
	assert.equal(
		occurrences(publish, /repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/main/gu),
		2
	);
	assert.equal(
		occurrences(publish, /"\$\{main_commit\}" != "\$\{LFC_SOURCE_COMMIT\}"/gu),
		2
	);
	assert.equal(occurrences(publish, /main_commit="\$\(/gu), 2);
	assert.match(publish, /\.object\.type == "commit"[\s\S]*?\.object\.sha/u);
	assert.match(
		verify,
		/validateNightlyRegistryState/u
	);
	assert.doesNotMatch(source, /registry-status|LFC_REGISTRY_STATUS|"status":"absent"/u);

});

void test("npm 12 view results pass through one fail-closed normalizer", async () => {
	const source = await workflow("publish-nightly.yml");
	const verifyRegistry = job(source, "verify-registry");
	assert.match(
		source,
		/LFC_NORMALIZE_NPM_VIEW_JSON: >-[\s\S]*?!Array\.isArray\(value\) \|\| value\.length !== 1[\s\S]*?JSON\.stringify\(value\[0\]\)/u
	);
	assert.equal(occurrences(source, /^\s*(?:if )?(?:! )?npm view\b/gmu), 6);
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
		"npm view @tryagaindev/litefold-calendar versions dist-tags"
	);
	const tagsNormalize = propagationLoop.indexOf('"${tags_raw}" "${tags_json}"');
	assert.ok(integrityView >= 0 && integrityView < integrityNormalize);
	assert.ok(integrityNormalize < tagsView);
	assert.ok(tagsView < tagsNormalize);
	assert.doesNotMatch(propagationLoop, /> "\$\{integrity_raw\}"[^;\n]*&&/u);
	assert.match(verifyRegistry, /pending or blocked publish-time review/u);
});

void test("nightly recovery follows the published predecessor rather than the source manifest parent", async (context) => {
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

	const publish = job(await workflow("publish-nightly.yml"), "publish");
	assert.doesNotMatch(publish, /LFC_PARENT_(?:COMMIT|VERSION)|releases\/tags\//u);
	assert.match(
		publish,
		/registry_predecessor="\$\(jq[\s\S]*?git\/ref\/tags\/v\$\{registry_predecessor\}[\s\S]*?git\/tags\/\$\{tag_object\}[\s\S]*?compare\/\$\{registry_predecessor_commit\}\.\.\.\$\{LFC_SOURCE_COMMIT\}/u
	);
	const historicalIdentities = [
		...publish.matchAll(/"([0-9.]+-alpha\.[0-9]+):([0-9a-f]{40})"/gu)
	].map((match) => ({ version: match[1], commit: match[2] }));
	assert.deepEqual(historicalIdentities, [
		{
			version: "0.1.0-alpha.0",
			commit: "53cf1fbb5f4176929c3105030a62e1d0c235b54f"
		},
		{
			version: "0.2.0-alpha.0",
			commit: "8250ac4da9ada72a2915b8f810be404667ab47da"
		}
	]);
	assert.match(publish, /"\$\{tag_object_type\}" == "commit"/u);
	assert.match(publish, /\.status == "ahead" or \.status == "identical"/u);
});

void test("publisher authorization is bound to one verified registry snapshot", async () => {
	const source = await workflow("publish-nightly.yml");
	const verify = job(source, "verify");
	const publish = job(source, "publish");
	assert.match(verify, /registry-state-sha256: \$\{\{ steps\.registry-state\.outputs\.registry-state-sha256 \}\}/u);
	assert.match(verify, /printf 'registry-state-sha256=%s\\neligible=%s\\n'/u);
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
	const source = await workflow("publish-nightly.yml");
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
	const source = await workflow("publish-nightly.yml");
	const stage = job(source, "stage-release");
	const verifyRegistry = job(source, "verify-registry");
	const publishRelease = job(source, "publish-release");
	assert.match(stage, /contents: write/u);
	assert.doesNotMatch(stage, /actions\/checkout@|npm ci|npm run |node scripts\//u);
	assert.match(stage, /LFC_ASSET_DIGESTS: \$\{\{ needs\.verify\.outputs\.asset-digests \}\}/u);
	assert.match(stage, /\.digest[\s\S]*?sha256:/u);
	assert.match(stage, /-F draft=true -F prerelease=true/u);
	assert.match(stage, /release\.draft === false && release\.immutable !== true/u);
	const releaseUploads = [...source.matchAll(/^\s*gh release upload[^\r\n]*$/gmu)];
	assert.equal(releaseUploads.length, 1);
	assert.match(releaseUploads[0][0], /--repo "\$\{GITHUB_REPOSITORY\}"/u);
	assert.doesNotMatch(source, /gh release upload\s+\\\r?\n/u);
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
	const provenancePolicy = /LFC_PROVENANCE_POLICY_START([\s\S]*?)LFC_PROVENANCE_POLICY_END/u.exec(
		verifyRegistry
	)?.[1];
	assert.equal(typeof provenancePolicy, "string");
	assert.match(provenancePolicy, /const eventName = process\.env\.GITHUB_EVENT_NAME/u);
	assert.match(provenancePolicy, /\["schedule", "workflow_dispatch"\]\.includes\(eventName\)/u);
	assert.doesNotMatch(provenancePolicy, /eventName === "push"/u);
	assert.match(provenancePolicy, /process\.env\.GITHUB_SHA === sourceCommit/u);
	assert.match(provenancePolicy, /process\.env\.GITHUB_WORKFLOW_SHA === sourceCommit/u);
	assert.match(provenancePolicy, /internalGitHub\?\.event_name === eventName/u);
	assert.match(provenancePolicy, /certificate\.buildTrigger === eventName/u);
	assert.match(verifyRegistry, /tags\?\.nightly !== process\.env\.LFC_VERSION[\s\S]*?tags\.latest !== process\.env\.LFC_EXPECTED_LATEST/u);
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
	const source = await workflow("publish-nightly.yml");
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
	assert.doesNotMatch(source, /LFC_RECOVERY_/u);
	assert.match(event, /workflow_run:[\s\S]*?- CI[\s\S]*?- Publish npm nightly[\s\S]*?branches:\s*\n\s+- main/u);
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
	assert.match(build, /LFC_UPSTREAM_EVENT: \$\{\{ github\.event\.workflow_run\.event \}\}/u);
	assert.match(build, /LFC_UPSTREAM_WORKFLOW: \$\{\{ github\.event\.workflow_run\.name \}\}[\s\S]*?LFC_UPSTREAM_WORKFLOW_PATH: \$\{\{ github\.event\.workflow_run\.path \}\}/u);
	assert.match(build, /upstream_workflow_path="\$\{LFC_UPSTREAM_WORKFLOW_PATH%@\*\}"/u);
	const ciRouteStart = build.indexOf('if [[ "${LFC_UPSTREAM_WORKFLOW}" == "CI"');
	const publisherRouteStart = build.indexOf(
		'elif [[ "${LFC_UPSTREAM_WORKFLOW}" == "Publish npm nightly"'
	);
	const releaseValidationStart = build.indexOf(
		'if [[ "${eligible}" == "true" && "${channel}" == "release" ]]'
	);
	assert.ok(ciRouteStart >= 0 && ciRouteStart < publisherRouteStart);
	assert.ok(publisherRouteStart < releaseValidationStart);
	const ciRoute = build.slice(ciRouteStart, publisherRouteStart);
	const publisherRoute = build.slice(publisherRouteStart, releaseValidationStart);
	assert.match(ciRoute, /upstream_workflow_path\}" == "\.github\/workflows\/ci\.yml"/u);
	assert.match(ciRoute, /LFC_UPSTREAM_EVENT\}" == "push"/u);
	assert.doesNotMatch(ciRoute, /workflow_dispatch/u);
	assert.match(publisherRoute, /upstream_workflow_path\}" == "\.github\/workflows\/publish-nightly\.yml"/u);
	assert.match(
		publisherRoute,
		/LFC_UPSTREAM_EVENT\}" == "schedule"[\s\S]*?workflow_dispatch[\s\S]*?created_at[\s\S]*?LFC_UPSTREAM_RUN_ID[\s\S]*?eligible=false/u
	);
	assert.match(publisherRoute, /workflow_dispatch/u);
	assert.match(build, /Unexpected upstream workflow identity:[\s\S]*?LFC_UPSTREAM_WORKFLOW_PATH/u);
	assert.match(build, /release_ref="v\$\{version\}"[\s\S]*?nightly[\s\S]*?release_ref\}\^\{commit\}[\s\S]*?source_commit/u);
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

void test("release docs distinguish nightly automation from future stable approval", async () => {
	const [administration, operations, releasing] = await Promise.all([
		readFile(join(REPOSITORY_ROOT, "docs", "release-administration.md"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "docs", "release-operations.md"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "docs", "releasing.md"), "utf8")
	]);
	assert.match(administration, /## Publication authority/u);
	assert.match(administration, /## Recovery matrix/u);
	for (const guide of [administration, operations, releasing]) {
		assert.match(guide, /nightly/iu);
		assert.match(guide, /stable/iu);
		assert.doesNotMatch(guide, /The merge push is the only publication trigger/u);
	}
});

void test("all third-party workflow actions are pinned to full commits", async () => {
	for (const name of [
		"ci.yml",
		"deploy-examples.yml",
				"publish-nightly.yml",
		"rollback-examples.yml"
	]) {
		const source = await workflow(name);
		for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
			assert.match(match[1], /^[^@\s]+@[0-9a-f]{40}$/u, `${name}: ${match[1]}`);
		}
	}
});

void test("CI rejects high-severity dependency regressions on pull requests", async () => {
	const source = await workflow("ci.yml");
	const verify = job(source, "verify");
	assert.match(trigger(source), /pull_request:/u);
	assert.match(source, /^permissions:\s*\n\s*contents: read/mu);
	assert.match(
		verify,
		/name: Reject high-severity dependency regressions[\s\S]*?if: \$\{\{ github\.event_name == 'pull_request' \}\}[\s\S]*?uses: actions\/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5\.0\.0[\s\S]*?fail-on-severity: high/u
	);
	assert.doesNotMatch(source, /pull-requests: write|issues: write/u);
});

void test("release gates and Playwright retain the complete browser-engine matrix", async () => {
	const [ciSource, publishSource, packageSource] = await Promise.all([
		workflow("ci.yml"),
		workflow("publish-nightly.yml"),
		readFile(join(REPOSITORY_ROOT, "package.json"), "utf8")
	]);
	const packageManifest = JSON.parse(packageSource);
	const ciVerify = job(ciSource, "verify");
	const publishVerify = job(publishSource, "verify");
	assert.match(ciVerify, /timeout-minutes: 45/u);
	for (const verify of [ciVerify, publishVerify]) {
		assert.match(
			verify,
			/name: Install pinned Playwright browsers[\s\S]*?npx playwright install --with-deps chromium firefox webkit/u
		);
	}
	assert.deepEqual(
		playwrightConfiguration.projects?.map(({ name, use }) => ({
			browserType: use?.defaultBrowserType,
			name
		})),
		[
			{ browserType: "chromium", name: "chromium" },
			{ browserType: "firefox", name: "firefox" },
			{ browserType: "webkit", name: "webkit" }
		]
	);
	assert.equal(
		packageManifest.scripts["test:browser:install"],
		"playwright install chromium firefox webkit"
	);
	assert.equal(packageManifest.scripts["test:browser:built"], "playwright test");
	for (const project of ["chromium", "firefox", "webkit"]) {
		assert.equal(
			packageManifest.scripts[`test:browser:${project}`],
			`npm run build && playwright test --project=${project}`
		);
	}
});

void test("workflow artifacts use bounded purpose-specific retention", async () => {
	const expectations = new Map([
		["ci.yml", [7, 7]],
		["deploy-examples.yml", [1, 1]],
		["publish-nightly.yml", [7, 30, 30]],
		["rollback-examples.yml", [1]]
	]);
	for (const [name, expected] of expectations) {
		const source = await workflow(name);
		const actual = [...source.matchAll(/retention-days:\s*(\d+)/gu)].map((match) => Number(match[1]));
		assert.deepEqual(actual, expected, name);
	}
});

void test("artifact downloads use the official Node 24 action", async () => {
	const workflows = [
		"deploy-examples.yml",
				"publish-nightly.yml",
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
	assert.equal(downloads, 5);
});

void test("workflow dependency caches stay disabled", async () => {
	for (const name of [
		"ci.yml",
		"deploy-examples.yml",
				"publish-nightly.yml",
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

void test("browser gates reject flakes and retain reproducible Firefox qualification evidence", async () => {
	const source = await workflow("ci.yml");
	const qualification = job(source, "firefox-qualification");
	assert.equal(playwrightConfiguration.failOnFlakyTests, true);
	assert.match(qualification, /os: \[ubuntu-latest, windows-latest\]/u);
	assert.match(qualification, /node scripts\/qualify-firefox\.mjs/u);
	assert.match(qualification, /if: always\(\)[\s\S]*?path: test-results\/firefox-qualification\//u);
	const config = await readFile(join(REPOSITORY_ROOT, "playwright.config.mjs"), "utf8");
	assert.match(config, /workers: process\.env\["CI"\] \? 1 : 2/u);
	assert.match(config, /retries: process\.env\["CI"\] \? 1 : 0/u);
	for (const project of playwrightConfiguration.projects) {
		if (project.name === "chromium") {
			assert.equal(project.grepInvert, undefined);
		} else {
			assert.equal(project.grepInvert?.test("@chromium-input"), true);
		}
	}
	const qualifier = await readFile(join(REPOSITORY_ROOT, "scripts", "qualify-firefox.mjs"), "utf8");
	assert.match(qualifier, /--repeat-each=20/u);
	assert.match(qualifier, /length: 3/u);
	assert.match(qualifier, /--retries=0/u);
	assert.match(qualifier, /--workers=1/u);
	assert.match(qualifier, /PLAYWRIGHT_JSON_OUTPUT_FILE/u);
	assert.match(qualifier, /PLAYWRIGHT_HTML_OUTPUT_DIR/u);
});
