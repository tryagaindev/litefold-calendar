# Alpha release operations runbook

Follow this runbook to publish `@tryagaindev/litefold-calendar` versions shaped like `0.x.y-alpha.N`. It assumes the operator is new to this repository but can follow exact instructions. The first stable release needs a separate procedure because npm's temporary alpha-as-`latest` rule must end first.

The operator runs **Prepare alpha release**, reviews and merges the resulting three-file pull request, reviews the staged draft, coordinates protected npm approval, advances `latest`, and verifies npm, the immutable GitHub prerelease, and automatic Pages deployment. The merge push is the only publication trigger.

The five GitHub Actions workflows used here are:

- **Prepare alpha release** (`prepare-alpha.yml`)
- **CI** (`ci.yml`)
- **Publish npm alpha** (`publish-alpha.yml`)
- **Deploy static examples** (`deploy-examples.yml`)
- **Roll back static examples** (`rollback-examples.yml`; recovery only)

Read the [release policy](releasing.md) and confirm the [hosted prerequisites](release-administration.md#one-time-hosted-prerequisites) before operating a release.

Repository automation may use [`$release-to-npm`](../.agents/skills/release-to-npm/SKILL.md) to coordinate this runbook. This runbook remains authoritative, and invoking the skill does not grant repository access, assignment as a required reviewer for the `npm` environment, or npm package maintainer authority.

## Stop rules

> Stop rather than improvise if a check fails or public state is unclear. Never publish from a local shell, create a tag or GitHub release manually, force-push, move or delete a release tag, replace a release asset, remove npm's `latest` tag, retry from an arbitrary commit, or continue after an unavailable or malformed registry response. Never share an npm OTP, token, CLI authentication URL, or authenticated browser session with automation.

## Roles

- The **release operator** coordinates preparation, review, merge, protected
  publication approval, and verification.
- An **npm package maintainer** advances the `latest` dist-tag. This can be the
  release operator.
- A **required reviewer for the `npm` environment** performs the protected
  deployment approval when GitHub policy requires one.

Do not weaken an environment rule to avoid involving a configured required
reviewer.

## Start a release record

Create a private working note outside the repository in an approved, non-versioned location, and fill in each value as it becomes known. Do not record credentials or one-time codes.

| Evidence | Value |
| --- | --- |
| Requested version action | Continue alpha, next patch alpha, or next minor alpha |
| Version | `EXACT_VERSION` |
| Tag | `vEXACT_VERSION` |
| Canonical `main` before preparation | 40-character commit |
| Security review and dispositions | URLs or sanitized private references |
| Hosted-control verification | UTC time and verifier |
| Prepare workflow run | URL |
| Generated release branch | `release/vEXACT_VERSION` |
| Generated branch head | 40-character commit |
| Compare/create-pull-request URL | URL |
| Submitted release pull request | URL |
| Submitted pull-request head | 40-character commit |
| Required review and CI evidence | URLs and approvals |
| Full release commit | 40-character `RELEASE_SHA` |
| Publisher run | URL |
| Protected npm approval | Reviewer and UTC time |
| Retained asset digests | Asset name and SHA-256 for every uploaded asset |
| npm integrity | `sha512-...` |
| npm publication availability | Available; private hold, block, or appeal reference when applicable |
| npm signatures and provenance | Verification result |
| npm `alpha` and `latest` | Exact version |
| GitHub prerelease | URL |
| Release Pages run | URL |
| Release metadata | URL |
| Completion | UTC date and time |

`EXACT_VERSION` never includes a leading `v`. The tag always does.

## 1. Complete preflight

Complete every checkbox before running the preparation workflow.

- [ ] Open **Actions** → **CI** and confirm the newest run for `main` succeeded.
- [ ] Confirm all intended source, documentation, tests, screenshots, design decisions, and risk-based accessibility evidence are already merged into `main`.
- [ ] Open `CHANGELOG.md` on `main` and confirm `[Unreleased]` contains meaningful user-visible bullet notes rather than placeholders.
- [ ] Open **Security & quality** and review code-scanning, Dependabot vulnerability and malware, and secret-scanning results. Resolve or explicitly disposition every release-blocking result, and record sanitized evidence in the private release record.
- [ ] Confirm GitHub's private-email setting is enabled for the account that will squash-merge the release pull request.
- [ ] Confirm the `npm` and `github-pages` environments, required CI check, protected `main`, protected `v*` tags, immutable releases, and npm trusted publisher still match the [administration guide](release-administration.md#one-time-hosted-prerequisites).

Normal release preparation and publication do not require a local commit. If an exceptional repair does require a human-authored local commit, first obtain the exact GitHub display name and protected no-reply email from the authenticated operator's own account settings, then configure and verify those values locally:

```sh
git config --local user.name "VERIFIED_GITHUB_NAME"
git config --local user.email "VERIFIED_GITHUB_NOREPLY_EMAIL"
git config --local --get user.name
git config --local --get user.email
```

The final two commands must print the exact values that the authenticated operator personally verified. Never copy an identity from documentation, reuse another operator's identity, or configure a public personal address.

Run these read-only npm checks in the npm package maintainer's shell:

```sh
npm whoami --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

If authentication is absent, the npm package maintainer runs the exact login command below and completes login and two-factor authentication privately in their own shell and browser:

```sh
npm login --registry https://registry.npmjs.org/
```

After login, rerun `npm whoami`. Do not give automation access to the npm
browser session, authentication URL, OTP, or token.

Both existing dist-tags must select the same completed prerelease before another alpha release begins. Stop if the registry response is missing, malformed, or the tags differ.

Executable workflow validation and focused tests own any compatibility allowance
needed for an existing release object. Do not treat an older object's shape as
permission to weaken current protected-tag or immutability requirements.

## 2. Prepare the release pull request

1. Open the repository's **Actions** tab.
2. Select **Prepare alpha release**.
3. Select **Run workflow**.
4. Set **Use workflow from** to `main`.
5. Choose one version action:

   | Choice | Result |
   | --- | --- |
   | **Continue alpha** | Increase only `alpha.N` |
   | **Next patch alpha** | Increase the patch and start `alpha.0` |
   | **Next minor alpha** | Increase the minor and start `alpha.0` |

6. Select **Run workflow** and wait for every job to succeed.
7. Record the exact version, generated branch, branch-head commit, preparation
   run, and compare/create-pull-request URL from the run summary. The workflow
   creates the branch but does not create a pull request.
8. After authorization to submit it, open the compare URL, create the release
   pull request, and record its actual URL and exact head commit.

Stop if the workflow fails, reports empty notes, reports a branch collision, or produces an unexpected version. Do not create the branch or edit release-state files by hand to bypass the failure. Classify an existing release branch or pull request with the [recovery matrix](release-administration.md#recovery-matrix) before resuming or cleaning it up.

## 3. Review and merge the release pull request

1. Open **Files changed** and confirm the pull request changes exactly:

   - `CHANGELOG.md`
   - `package-lock.json`
   - `package.json`

2. Confirm the pull-request head still equals the recorded generated branch
   head.
3. Confirm `package.json`, top-level `package-lock.json#version`, and `package-lock.json#packages[""]#version` all equal `EXACT_VERSION`.
4. Confirm the newest dated changelog heading is `[EXACT_VERSION]` and contains the intended notes.
5. Open **Checks** and wait for `CI / Build, test, and verify package` to succeed.
6. Recheck any security, accessibility, design, screenshot, or manual evidence affected by the release.
7. Use **Squash and merge** with the subject `chore: release EXACT_VERSION`.
8. Open the resulting commit on `main`. Record its full 40-character SHA as `RELEASE_SHA` and confirm the human author email is the protected GitHub no-reply address.

Stop on an extra file, partial version update, unexpected co-author identity, failing check, or ambiguous check result. The publication workflow requires the exact three-file first-parent diff.

## 4. Review and approve publication

The merge starts **Publish npm alpha** for `RELEASE_SHA`.

1. Open that exact workflow run; do not use a run for another commit. In the run header, confirm the branch is `main` and the commit is `RELEASE_SHA`.
2. Confirm **Detect a generated release candidate**, **Verify exact source and create release evidence**, and **Stage exact tag, draft, and release assets** succeed.
3. Inspect the draft GitHub prerelease. Confirm its tag and target are `vEXACT_VERSION` and `RELEASE_SHA`, its notes match the changelog, and it has exactly these five uploaded assets:

   - the `.tgz` package
   - `package-verification.json`
   - `sbom.spdx.json`
   - `SHA256SUMS`
   - `LICENSE`

   GitHub's automatic **Source code (zip)** and **Source code (tar.gz)** links are not uploaded release assets and are excluded from this count.

   Record each uploaded asset's name and SHA-256 digest from the retained
   evidence and staged-release verification before approval.

4. At **Publish or resume the verified npm alpha**, select **Review deployments**. The publication summary is written only after registry verification and finalization, so it is not an approval prerequisite.
5. Select the `npm` environment, then select **Approve and deploy**. When
   policy requires a reviewer, the configured required reviewer for the `npm`
   environment performs this exact approval. Record the reviewer and UTC time.
6. Wait until the job reports that npm accepted `EXACT_VERSION` under `alpha`.

The workflow publishes through npm trusted publishing. Never run `npm publish` locally and never add an `NPM_TOKEN` to GitHub. Its GitHub release writer is intentionally source-free and supplies `--repo` explicitly to GitHub CLI commands; do not add a checkout to that job.

## 5. Advance the temporary npm `latest` tag

While the publisher is polling, the npm package maintainer runs these commands in their own authenticated shell after replacing `EXACT_VERSION`:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version dist.integrity --json --registry https://registry.npmjs.org/
npm dist-tag add @tryagaindev/litefold-calendar@EXACT_VERSION latest --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

The first result must name the exact candidate. The final result must show both `alpha` and `latest` equal `EXACT_VERSION`.

Use `npm dist-tag add`; never use `npm dist-tag rm latest`. If npm opens web authentication, the npm package maintainer completes it privately and returns to the same command. Do not grant npm browser access to automation or share the authentication URL or OTP.

npm's temporary `latest` dist-tag does not make the GitHub release “Latest.” The workflow intentionally leaves the GitHub release marked as a prerelease with `make_latest=false`.

If the publisher's polling window expires, first query the exact candidate
again. When it is publicly readable with the expected integrity and only
`latest` lags, finish and verify the same dist-tag update, then use **Re-run
failed jobs** on the original publisher run. When the exact candidate remains
unavailable, follow the publish-time-review case in the
[recovery matrix](release-administration.md#recovery-matrix) and do not assume a
dist-tag change is the only missing step.

## 6. Verify npm and the GitHub prerelease

Wait for **Publish npm alpha** to complete successfully, then confirm:

- [ ] Both npm dist-tags equal `EXACT_VERSION`.
- [ ] `dist.integrity` equals `npmIntegrity` in `package-verification.json`.
- [ ] The workflow's clean install, root import, extension import, stylesheet import, signatures, and provenance checks passed.
- [ ] The npm package page shows the published README, renders the logo and both representative screenshots, and resolves the hosted demo and full-gallery links.
- [ ] Tag `vEXACT_VERSION` resolves to `RELEASE_SHA`.
- [ ] The GitHub release is public, `draft=false`, `prerelease=true`, and immutable.
- [ ] The release target is `RELEASE_SHA`, the notes are exact, and the same five uploaded assets remain attached; the two automatic source-code archives are excluded from the asset count.

GitHub locks the tag and uploaded assets, but it still permits edits to the
release title and notes. Project policy forbids those edits after publication;
verify the title and notes against retained evidence rather than treating the
immutability badge as proof of their continued identity. Do not edit or delete
the release.

## 7. Verify the automatic release Pages deployment

A successful **Publish npm alpha** completion automatically triggers **Deploy static examples** through GitHub's native `workflow_run` event. Do not manually dispatch a release deployment and do not supply a release ref.

Automatic and rollback Pages runs share one non-canceling workflow-level queue so retained-state writes cannot race deployment. A publisher-linked run may legitimately remain queued behind earlier Pages work. Do not cancel it, rerun around it, or weaken the queue; wait for that exact run to start and finish.

Two **Deploy static examples** runs can exist for the same `RELEASE_SHA`:

- the run linked to **CI** updates the rolling `main` channel;
- the run linked to **Publish npm alpha** adds the immutable `release` channel.

Open the publisher-linked run and confirm its upstream head SHA is `RELEASE_SHA`. **Stage a verified Pages channel**, **Preserve deployment snapshot**, **Package retained Pages snapshot**, and **Deploy retained static examples** must succeed. The separately dispatched **Roll back static examples** workflow must not run as part of a release. Then check:

```text
https://tryagaindev.github.io/litefold-calendar/releases/EXACT_VERSION/examples/metadata.json
https://tryagaindev.github.io/litefold-calendar/site-manifest.json
```

- [ ] Release metadata contains `"channel": "release"`, `"version": "EXACT_VERSION"`, and `"commit": "RELEASE_SHA"`.
- [ ] `site-manifest.json` maps that version and commit to `releases/EXACT_VERSION/examples/`.
- [ ] The release landing page and at least one recipe deep link load and show the same version and source commit.

Record the Pages run, metadata URL, and UTC completion time. The release is complete only after every npm, tag, GitHub release, and Pages identity matches.

## Recovery routing

Use the canonical [recovery matrix](release-administration.md#recovery-matrix)
before every rerun or exceptional mutation. An existing run retains its
original commit, ref, and workflow definition; it cannot consume a later source
or publisher-workflow fix.

- Resume the original exact attempt only when the matrix permits it and all
  source, workflow, retained-byte, and public identities still match.
- When npm contains the exact verified candidate but `latest` is behind, use
  step 5 above and then resume the original publisher as directed by the matrix.
- On conflicting or unprovable public state, changed source or workflow bytes,
  or a defective published artifact, stop and follow the greater-version or
  exceptional administrative path.
- For a publisher-linked Pages failure or a missing downstream run, use the
  Pages cases in the recovery matrix. For a rolling `main` rollback, follow
  the [deployment rollback procedure](example-deployment.md#roll-back-the-rolling-preview).

Record the observed state, exact identities, authorization, action, and
sanitized recovery evidence in the private release record. Never turn the
rolling-preview rollback into a release-deployment shortcut.

[Back to the documentation hub](README.md)
