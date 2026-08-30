# Alpha release operations runbook

Follow this runbook to publish `@tryagaindev/litefold-calendar` versions shaped like `0.x.y-alpha.N`. It assumes the operator is new to this repository but can follow exact instructions. The first stable release needs a separate procedure because npm's temporary alpha-as-`latest` rule must end first.

The operator runs **Prepare alpha release**, reviews and merges its three-file pull request, reviews the staged draft, approves the protected npm environment, advances `latest`, and verifies npm, the immutable GitHub prerelease, and automatic Pages deployment. The merge push is the only publication trigger.

The five GitHub Actions workflows used here are:

- **Prepare alpha release** (`prepare-alpha.yml`)
- **CI** (`ci.yml`)
- **Publish npm alpha** (`publish-alpha.yml`)
- **Deploy static examples** (`deploy-examples.yml`)
- **Roll back static examples** (`rollback-examples.yml`; recovery only)

Read the [release policy](releasing.md) and confirm the [hosted prerequisites](release-administration.md#one-time-hosted-prerequisites) before operating a release.

## Stop rules

> Stop rather than improvise if a check fails or public state is unclear. Never publish from a local shell, create a tag or GitHub release manually, force-push, move or delete a release tag, replace a release asset, remove npm's `latest` tag, retry from an arbitrary commit, or continue after an unavailable or malformed registry response. Never share an npm OTP, token, CLI authentication URL, or authenticated browser session with automation.

## Roles

- The **release operator** prepares, reviews, merges, approves, and verifies the release.
- An **npm owner** advances the `latest` dist-tag. This can be the release operator.
- An **npm environment reviewer** approves the protected deployment when GitHub policy does not allow the operator to approve it.

Do not weaken an environment rule to avoid involving an authorized reviewer.

## Start a release record

Create a private working note and fill in each value as it becomes known. Do not record credentials or one-time codes.

| Evidence | Value |
| --- | --- |
| Version | `EXACT_VERSION` |
| Tag | `vEXACT_VERSION` |
| Full release commit | 40-character `RELEASE_SHA` |
| Prepare workflow run | URL |
| Release pull request | URL |
| Required CI run | URL |
| Publisher run | URL |
| npm integrity | `sha512-...` |
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
- [ ] Open **Security** and review code-scanning, Dependabot, secret-scanning, and malware results. Resolve or explicitly disposition every release-blocking result.
- [ ] Confirm GitHub's private-email setting is enabled for the account that will squash-merge the release pull request.
- [ ] Confirm the `npm` and `github-pages` environments, required CI check, protected `main`, protected `v*` tags, immutable releases, and npm trusted publisher still match the [administration guide](release-administration.md#one-time-hosted-prerequisites).

Normal release preparation and publication do not require a local commit. If an exceptional repair does require a human-authored local commit, set and verify the protected identity first. The commands below are exact when the operator is Basi:

```sh
git config --local user.name "Basi Angulo"
git config --local user.email "6586019+redbasi@users.noreply.github.com"
git config --local --get user.name
git config --local --get user.email
```

For Basi, the last two commands must print exactly `Basi Angulo` and `6586019+redbasi@users.noreply.github.com`. Any other operator must substitute their own GitHub name and protected GitHub no-reply address from their GitHub email settings, then verify both exact values. Never reuse another operator's identity or configure a public personal address.

Run these read-only npm checks in the npm owner's shell:

```sh
npm whoami --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

If authentication is absent, the npm owner runs the exact login command below and completes login and two-factor authentication privately in their own shell and browser:

```sh
npm login --registry https://registry.npmjs.org/
```

After login, rerun `npm whoami`. Do not give an assistant or automation access to the npm browser session, authentication URL, OTP, or token.

Both existing dist-tags must select the same completed prerelease before another alpha release begins. Stop if the registry response is missing, malformed, or the tags differ.

The lightweight tags `v0.1.0-alpha.0` at `53cf1fbb5f4176929c3105030a62e1d0c235b54f` and `v0.2.0-alpha.0` at `8250ac4da9ada72a2915b8f810be404667ab47da` are exact historical exceptions. Do not move, recreate, or annotate them. No other lightweight release tag is accepted.

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
7. Copy the exact version and pull-request link from the run summary into the release record.
8. Open the prefilled pull request.

Stop if the workflow fails, reports empty notes, reports a branch collision, or produces an unexpected version. Do not create the branch or edit release-state files by hand to bypass the failure.

## 3. Review and merge the release pull request

1. Open **Files changed** and confirm the pull request changes exactly:

   - `CHANGELOG.md`
   - `package-lock.json`
   - `package.json`

2. Confirm `package.json`, top-level `package-lock.json#version`, and `package-lock.json#packages[""]#version` all equal `EXACT_VERSION`.
3. Confirm the newest dated changelog heading is `[EXACT_VERSION]` and contains the intended notes.
4. Open **Checks** and wait for `CI / Build, test, and verify package` to succeed.
5. Recheck any security, accessibility, design, screenshot, or manual evidence affected by the release.
6. Use **Squash and merge** with the subject `chore: release EXACT_VERSION`.
7. Open the resulting commit on `main`. Record its full 40-character SHA as `RELEASE_SHA` and confirm the human author email is the protected GitHub no-reply address.

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

4. At **Publish or resume the verified npm alpha**, select **Review deployments**. The publication summary is written only after registry verification and finalization, so it is not an approval prerequisite.
5. Select the `npm` environment, then select **Approve and deploy**. If self-approval is prohibited, ask the authorized environment reviewer to perform this exact approval.
6. Wait until the job reports that npm accepted `EXACT_VERSION` under `alpha`.

The workflow publishes through npm trusted publishing. Never run `npm publish` locally and never add an `NPM_TOKEN` to GitHub. Its GitHub release writer is intentionally source-free and supplies `--repo` explicitly to GitHub CLI commands; do not add a checkout to that job.

## 5. Advance the temporary npm `latest` tag

While the publisher is polling, the npm owner runs these commands in their own authenticated shell after replacing `EXACT_VERSION`:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version dist.integrity --json --registry https://registry.npmjs.org/
npm dist-tag add @tryagaindev/litefold-calendar@EXACT_VERSION latest --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

The first result must name the exact candidate. The final result must show both `alpha` and `latest` equal `EXACT_VERSION`.

Use `npm dist-tag add`; never use `npm dist-tag rm latest`. If npm opens web authentication, the npm owner completes it privately and returns to the same command. Do not grant npm browser access to automation or share the authentication URL or OTP.

npm's temporary `latest` dist-tag does not make the GitHub release “Latest.” The workflow intentionally leaves the GitHub release marked as a prerelease with `make_latest=false`.

If the publisher's polling window expires first, finish and verify the same dist-tag update, then use **Re-run failed jobs** on the original publisher run.

## 6. Verify npm and the GitHub prerelease

Wait for **Publish npm alpha** to complete successfully, then confirm:

- [ ] Both npm dist-tags equal `EXACT_VERSION`.
- [ ] `dist.integrity` equals `npmIntegrity` in `package-verification.json`.
- [ ] The workflow's clean install, root import, extension import, stylesheet import, signatures, and provenance checks passed.
- [ ] Tag `vEXACT_VERSION` resolves to `RELEASE_SHA`.
- [ ] The GitHub release is public, `draft=false`, `prerelease=true`, and immutable.
- [ ] The release target is `RELEASE_SHA`, the notes are exact, and the same five uploaded assets remain attached; the two automatic source-code archives are excluded from the asset count.

Do not edit the tag, release, notes, or assets after publication.

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

## Recovery decisions

A rerun of an existing GitHub Actions run keeps that run's original commit SHA, ref, and workflow definition. Use one only after a transient infrastructure, authentication, or hosted-state configuration problem is resolved without changing repository source or that workflow. If recovery requires a source or package change, stop: the original run cannot consume it. Rerunning a successful publisher solely to emit a missing downstream event is different: the publisher retains its original identity, but the newly created Pages run uses the current default-branch `deploy-examples.yml` definition while still checking out `RELEASE_SHA` for release source and assembly tooling. Review that current workflow and validate the new Pages run independently.

| Observed state | Required action |
| --- | --- |
| Failure before npm publication | Resolve only transient infrastructure, authentication, or hosted-state configuration, then rerun the original publisher attempt. If source or workflow files must change, prepare a greater alpha. |
| npm has the exact candidate, but `latest` is old | Verify exact integrity, run the documented `npm dist-tag add`, then rerun failed jobs in the original publisher run. |
| npm bytes, tag, release, notes, or assets conflict or cannot be proved | Stop. Do not delete, move, overwrite, or reuse the version. Investigate and prepare a greater alpha. |
| The publisher-linked Pages run failed | Rerun that original **Deploy static examples** run only for a transient or hosted-state failure. If repository or workflow files must change, stop and use administration recovery; an already-published package requires a greater alpha. |
| No publisher-linked Pages run was created | Confirm the original publisher succeeded, review the current default-branch `deploy-examples.yml`, then select **Re-run all jobs** on that original publisher. Its successful completion emits a new native event. Confirm the new Pages run uses `RELEASE_SHA` and validate it independently. |
| Published package or immutable prerelease is defective | Leave immutable state intact, deprecate the package version when appropriate, and publish a corrected greater alpha. |
| Rolling `main` preview must move backward | Follow the [rollback procedure](example-deployment.md#roll-back-the-rolling-preview). **Roll back static examples** is manual, recovery-only, and accepts only **Snapshot ref**. |

For details on exceptional registry or hosted state, use the [release recovery matrix](release-administration.md#recovery-matrix). Never turn the rollback dispatch into a release-deployment shortcut.

[Back to the documentation hub](README.md)
