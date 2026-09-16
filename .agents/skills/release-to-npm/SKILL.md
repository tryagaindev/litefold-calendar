---
name: release-to-npm
description: Coordinate a maintainer-authorized npm release through repository-owned preparation, protected publication, verification, and recovery. Use when asked to prepare, publish, resume, verify, or diagnose an npm release; do not use for ordinary commits, unsupported release transitions, or ad hoc local publication.
---

# Release to npm

Coordinate the repository-owned release process within the user's authorized
scope and the configured hosted controls. Read-only planning and verification
do not authorize a public mutation. An explicit request to implement and publish
through named delivery stages does authorize those stages; preserve that scope
instead of requesting the same permission again.

## Load repository authority

When the current repository matches
[the bundled repository reference](references/litefold-calendar.md), read it
first. Otherwise, read a matching repository reference when one exists, then
open the canonical policy, runbook, or recovery section for the current phase.
Treat checked-in documentation, workflows, manifests, and hosted state as
authoritative when they differ from this skill.

Classify the request before acting:

- **Plan or preflight:** inspect state without mutating it.
- **Start:** prepare a new candidate after its version strategy is explicit.
- **Continue:** resume an identified candidate and exact attempt.
- **Verify:** compare recorded and public identities without changing them.
- **Recover:** classify the observed state against the canonical recovery matrix.

Stop when no repository reference exists, the repository or package identity
does not match it, or the requested transition is unsupported by a reviewed
procedure.

## Establish exact state

Derive release state from the canonical hosted default branch, identified
workflow runs, the repository's private release record, and fresh read-only
registry responses. A local branch, tag, worktree, artifact directory, cached
response, or remembered prior run is not publication authority.

Derive the candidate strategy, environment names, and required roles from the
current runbook and hosted state. An authorized nightly start uses unattended
OIDC trusted publication and does not require a manual environment reviewer, npm
token, or local npm login. Nightly leaves `latest` unchanged and verifies it
through public registry reads. Stable publication retains its separately
configured review controls.
One person may fill multiple roles only when the hosted policy permits it.

For an authorized start or continuation, create or update the private release
record defined by the runbook. Keep it outside the repository in an approved,
non-versioned location. Never place a token, password, one-time code,
authentication URL, cookie, or authenticated browser state in the record,
conversation, command output, or automation.

Treat unavailable, stale, malformed, conflicting, or ambiguous identity evidence
as a stop condition.

## Respect mutation boundaries

Immediately before every external mutation:

1. State the exact repository, candidate version, source commit, workflow run,
   and current public identity that are known at that phase.
2. Explain the expected mutation and its irreversible or protected effects.
3. Confirm that the user's existing authorization covers that mutation; ask only
   when it does not.
4. Follow only the corresponding canonical runbook section.
5. Read back the resulting state and update the private record before advancing.

Identify the authorized preparation, pull-request, merge, publication, registry,
deployment, and recovery stages explicitly. Do not widen an ordinary Git request
into a release or a nightly request into a stable release. Required hosted reviews
still apply even when the user authorizes a complete delivery. A scheduled nightly
uses its reviewed unattended workflow; do not insert an interactive approval into
that workflow or bypass the distinct stable publication controls.

Never publish locally, collect credentials in conversation or release notes,
manufacture a release trigger, push or move a version tag, rewrite a shared branch,
or create public release state from an arbitrary ref. Changes to hosted controls
or credential policy require an explicitly authorized, reviewed migration; a
failed release is not permission to improvise one. Do not introduce an npm token
or a secondary dist-tag write into the nightly path. The first stable release
owns the future transition of `latest` to stable.

## Follow the selected phase

Use the repository reference to route each phase to its canonical owner:

- Policy determines supported versions, invariants, and completion criteria.
- The operations runbook owns the normal ordered procedure and release record.
- Administration guidance owns hosted controls, unsupported transitions,
  exceptional mutations, reruns, and recovery decisions.
- Package verification owns artifact and registry evidence.
- Deployment guidance owns any release-linked documentation or example site.

Do not copy commands or checklists from those documents into this skill. Re-read
the current section immediately before acting because release procedures can
change independently of the skill.

After each step, verify that version, commit, artifact, registry, tag, release,
and deployment identities still refer to the same candidate. Report partial
success precisely; a started workflow or accepted package upload is not a
completed release.

## Recover by identity

Consult the canonical recovery matrix before retrying anything. Resume an
existing attempt only when the runbook permits it and exact source, workflow,
artifact, and public identities remain unchanged. If any public bytes or
identity conflict, evidence cannot be proved, source or workflow code must
change, or the artifact is defective, stop and follow the documented greater-
version or separately approved administrative path.

Never reuse a published version, approximate a commit, move or recreate an
immutable tag, overwrite retained evidence, or substitute one deployment channel
for another.

## Declare completion conservatively

Declare completion only after every item required by the operations runbook and
private release record has been verified from its owning system. Report exact
identities, completed approvals, verification results, and any remaining manual
or recovery work.
