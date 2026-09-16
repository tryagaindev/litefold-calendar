# Nightly release operations runbook

Use this runbook to publish and verify a nightly from reviewed `main`. Daily publication runs at **09:00 UTC**; use manual dispatch when a completed change needs publication immediately. The publisher derives the version, publishes under `nightly` through OIDC only, verifies that `latest` is unchanged, and hands off release Pages automatically.

There is no release-preparation pull request or manual npm approval for a normal nightly. This guide also explains how to recognize a successful unchanged-source skip. Stable publication is a future procedure described in [release administration](release-administration.md#future-stable-release); these commands do not publish stable.

The relevant Actions workflows are:

| Workflow | Purpose |
| --- | --- |
| **CI** (`ci.yml`) | Verify the exact `main` commit, including Chromium and WebKit checks |
| **Publish npm nightly** (`publish-nightly.yml`) | Scheduled or manually requested nightly snapshot |
| **Deploy static examples** (`deploy-examples.yml`) | Automatic rolling preview and publisher-linked release Pages |
| **Roll back static examples** (`rollback-examples.yml`) | Restore retained rolling-preview bytes; recovery only |

Read the [release policy](releasing.md) and confirm [hosted prerequisites](release-administration.md#one-time-hosted-prerequisites) before the first run or after an administrative change. The [release operation skill](../.agents/skills/release-to-npm/SKILL.md) coordinates this runbook; the runbook remains authoritative.

## Stop rules

Stop on a failed required check, unknown registry state, mismatched identity, or missing retained evidence. Do not run `npm publish` locally, move or delete a release tag, replace public assets, remove `latest`, or rerun from another source to rescue an existing version. Keep credential material and authentication codes out of chat, logs, and the release record.

## Roles

The release operator verifies the change and follows the publisher through Pages completion. Repository administrators maintain environments and required checks. An npm package maintainer configures the trusted publisher. Once those controls are configured, a normal run needs no npm token, manual channel update, or protected-environment approval.

## Start a release record

Keep a private, non-versioned record with these values. Record sanitized evidence, never secrets.

| Evidence | Value to record |
| --- | --- |
| Requested change | Pull request and phase commits |
| Source identity | Full 40-character `SOURCE_SHA`, source development version |
| Validation | Exact-main CI run, final gate, local Firefox results when applicable, visual review |
| Hosted controls | Verifier and UTC verification time |
| Publisher identity | Run URL, run ID, original UTC creation time, attempt number |
| Published identity | `EXACT_VERSION`, protected tag `vEXACT_VERSION` |
| Package evidence | Receipt, npm integrity, every retained asset digest, SBOM, compatibility target report |
| Public verification | Registry versions/tags including preflight and final `latest`, signatures, provenance, immutable GitHub prerelease |
| Pages | Publisher-linked run, release metadata URL, matching source and version |
| Completion or skip | UTC time and evidence establishing the outcome |

`EXACT_VERSION` has no leading `v`; the Git tag does. Copy the generated version from the run or receipt. Do not create a candidate version by hand.

## 1. Complete preflight

- [ ] All intended changes and `[Unreleased]` notes are merged through required review.
- [ ] The newest **CI** run for the exact current `main` commit succeeded with **Build, test, and verify package**. Hosted browser checks cover Chromium and WebKit; Firefox is checked locally and has no required hosted status.
- [ ] The final screenshots and any required manual accessibility evidence were reviewed.
- [ ] Release-blocking security findings are resolved or explicitly dispositioned with recorded evidence.
- [ ] Hosted settings match the [administration guide](release-administration.md#one-time-hosted-prerequisites).
- [ ] Record the current `latest` version for read-only comparison after publication. Before stable exists, it must select the frozen historical `alpha`; afterward, it must select a stable version.
- [ ] The preceding nightly is complete through Pages, or any partial attempt has been classified for recovery first.

Use these read-only checks when working from GitHub CLI and npm:

```sh
gh api repos/tryagaindev/litefold-calendar/git/ref/heads/main --jq .object.sha
gh run list --repo tryagaindev/litefold-calendar --workflow ci.yml --branch main --limit 10
npm view @tryagaindev/litefold-calendar versions dist-tags --json --registry https://registry.npmjs.org/
```

Record the returned main commit as `SOURCE_SHA` and inspect the matching CI run. Public npm reads do not require login. During the alpha-to-nightly transition, the historical `alpha` version supplies the predecessor; once a nightly exists, resume incomplete nightly work before starting another candidate.

<a id="2-prepare-the-release-pull-request"></a>
<a id="3-review-and-merge-the-release-pull-request"></a>

## 2. Request the exact nightly

1. Open the repository's **Actions** tab and select **Publish npm nightly**.
2. Select **Run workflow**, with **Use workflow from** set to `main`.
3. Set **Optional exact current main commit assertion** to the recorded `SOURCE_SHA`.
4. Select **Run workflow** and open the new run. Confirm the branch and full source commit match the record.

Equivalent GitHub CLI dispatch, after replacing `SOURCE_SHA`:

```sh
gh workflow run publish-nightly.yml --repo tryagaindev/litefold-calendar --ref main -f expected-source=SOURCE_SHA
```

Record the actual run URL and ID from Actions. The assertion stops a mismatched request; it does not allow publishing an arbitrary commit. If `main` advances before a new publication, verify its CI and request that reviewed source instead.

The source manifest remains `0.6.0-nightly.0`. For example, a run created at `2026-09-12T09:00:00Z` with ID `123456789` derives `0.6.0-nightly.20260912090000.123456789`. Reruns retain the original timestamp and ID.

<a id="4-review-and-approve-publication"></a>

## 3. Follow verification and publication

Wait for the exact run to finish. It may queue behind an earlier publication; do not bypass or cancel the shared queue.

| Job | Expected outcome |
| --- | --- |
| **Select the exact green main snapshot** | Confirms current main, successful exact-source CI, and immutable run identity |
| **Verify exact source and create release evidence** | Checks previous completion and either skips unchanged source or builds one verified candidate |
| **Stage exact tag, draft, and release assets** | Stages the exact source tag and five retained assets |
| **Publish or resume the verified npm nightly** | Publishes or recognizes the identical retained package through `npm-nightly` OIDC |
| **Verify registry integrity, imports, and provenance** | Verifies the public package from a clean consumer and confirms `latest` still selects its preflight version |
| **Publish the verified GitHub prerelease** | Finalizes the verified immutable prerelease and triggers Pages |

The five uploaded release assets are the package `.tgz`, `package-verification.json`, `sbom.spdx.json`, `SHA256SUMS`, and `LICENSE`. GitHub's automatically generated source archives are excluded from that count. The Actions bundle and notes are retained for 30 days; browser diagnostics for seven days. Complete recovery while evidence remains available.

If the summary reports **No new source since the last completely verified nightly**, downstream publication jobs are skipped. Verify that the previous nightly's receipt and release Pages identify `SOURCE_SHA`; record a successful skip, not a new publication.

<a id="5-advance-the-temporary-npm-latest-tag"></a>

## 4. Verify npm and channel ownership

Replace `EXACT_VERSION` with the generated published version and run:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version dist.integrity --json --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar versions dist-tags --json --registry https://registry.npmjs.org/
```

Check that the exact package is readable and its `dist.integrity` equals the receipt's `npmIntegrity`. `nightly` must select `EXACT_VERSION`. `latest` must still select its recorded preflight version; the nightly workflow never updates it. Before stable exists, `latest` selects the frozen historical `alpha`; once any stable version exists, it selects stable. Historical `alpha` stays unchanged.

Channel verification is read-only. If `latest` changed or registry identity is uncertain, stop and use the [recovery matrix](release-administration.md#recovery-matrix). Do not add a token or move a dist-tag to repair a nightly. A successful npm upload is not permission to create a replacement candidate while completion remains uncertain.

<a id="6-verify-npm-and-the-github-prerelease"></a>

## 5. Verify the immutable release and installed package

- [ ] The receipt's published version, source version, full commit, workflow identity, and manifest transformation match the record.
- [ ] The tag resolves to `SOURCE_SHA`; the GitHub release is public, immutable, and marked as a prerelease.
- [ ] All five uploaded assets have the recorded digests; the notes and title match retained evidence.
- [ ] The exact nightly version's npm package page renders its README, installation commands, and documentation links correctly. Select the nightly version explicitly; `latest` still identifies historical alpha before stable.
- [ ] Clean public-package imports, stylesheet use, core/WebMCP integration, registry signatures, and provenance checks passed.
- [ ] For a release introducing calendar behavior, a clean consumer verifies count activation, remote filtering, and focus return after an application dialog.

GitHub locks the published tag and assets. Titles, notes, and prerelease metadata remain editable on the platform, so compare those with retained evidence as well. Project policy preserves them after publication. See [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

<a id="7-verify-the-automatic-release-pages-deployment"></a>

## 6. Verify the automatic release Pages deployment

A successful publisher triggers **Deploy static examples** through `workflow_run`. Select the run linked to **Publish npm nightly**; a separate CI-linked run for the same commit updates only the rolling preview.

Verify these resources after replacing `EXACT_VERSION`:

```text
https://tryagaindev.github.io/litefold-calendar/releases/EXACT_VERSION/examples/metadata.json
https://tryagaindev.github.io/litefold-calendar/site-manifest.json
```

- [ ] Release metadata contains `channel: release`, the exact published version, and `SOURCE_SHA`.
- [ ] The site manifest maps that version and commit to `releases/EXACT_VERSION/examples/`.
- [ ] The landing page and a recipe deep link load and show the same version and commit-pinned source links.
- [ ] The Pages run used the exact successful publisher and verified its receipt and immutable release assets.

The publisher hands off Pages without waiting for it. The release record is complete only after these checks pass. For the migration's final manual release, dispatch once more after completion and confirm unchanged-source skipping without a second package or release.

## Recovery routing

Use the [recovery matrix](release-administration.md#recovery-matrix) before rerunning. An original run keeps its source, workflow definition, version, and identity. A transient failure may resume matching retained bytes; later source or workflow corrections require a new reviewed version. Rolling-preview rollback never repairs or replaces a release snapshot.

[Back to the documentation hub](README.md)
