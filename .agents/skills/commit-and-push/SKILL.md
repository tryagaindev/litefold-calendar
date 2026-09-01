---
name: commit-and-push
description: Safely finish an already-scoped code change by auditing Git state, validating and committing only the intended files, and pushing a feature branch. Use when asked to commit, push, publish a code branch, or carry completed work through Git; do not use for version releases, tags, package publication, deployments, or pull-request merges.
---

# Commit and Push

Complete only the Git stages the user requested. A request to commit does not
authorize a push, and a request to push does not authorize creating or amending
any commit.

## Keep ordinary changes separate from releases

This is the common change-delivery workflow for contributors and maintainers
alike. It may create a focused commit and push a feature branch for review. A
maintainer uses the same protected path for ordinary repository changes.

Stop when the requested outcome includes a version release, release branch,
tag, npm or other package publication, GitHub Release, deployment, registry
mutation, or release recovery. Those are administrative operations and require
a separately invoked release workflow with its own authorization and failure
rules. Do not reproduce release commands here or treat a commit-and-push request
as release approval.

Never infer authorization to merge a pull request, push the default branch,
rewrite shared history, force-push, push tags, or create external release state.

## Establish the real repository state

Before staging or changing refs:

1. Read the repository's applicable instructions, contribution policy, CI
   workflow, and validation commands. When the current repository matches
   [the bundled repository reference](references/litefold-calendar.md), read it.
2. Check for an in-progress merge, rebase, cherry-pick, or revert. Stop and
   report it rather than layering a new commit onto an unresolved operation.
3. Inspect `git status --short --branch`, unstaged and staged diffs, `git
   branch -vv`, the remote names, and `git stash list`. A clean worktree does
   not mean there is no stashed or already-committed work. Do not print a
   credential-bearing remote URL or stash contents merely to inventory them.
4. Identify the exact files and hunks belonging to the user's task. Preserve
   unrelated tracked, untracked, ignored, and stashed work. If mixed changes
   cannot be separated confidently, ask before staging.
5. Inspect currently active commit and push hooks plus signing requirements,
   then verify the configured author identity. Report an unexpected identity or
   hook and ask rather than silently inventing or changing repository or global
   Git configuration.
6. Do not automatically stash, pop, drop, reset, clean, prune Git recovery
   objects, delete branches, or amend a pre-existing commit.

If a push or remote-based branch decision is requested, fetch the selected
canonical remote with remote-tracking pruning before judging divergence. This
may remove stale remote-tracking refs, but it must not remove local branches or
Git recovery objects. Detect the default branch from canonical remote state
rather than assuming its name. Resolve the canonical fetch remote and writable
push remote separately, and verify their sanitized host/repository identities
without displaying embedded credentials.

## Choose the branch before committing

Ordinary repository work belongs on a feature branch when the repository uses
pull requests or protects its default branch. Create or switch to that branch
before making the new commit. Follow the repository's branch convention; in a
tool-managed task, use the configured branch prefix when one exists. Otherwise,
derive a short feature-branch name from the scoped change.

Do not commit or ordinarily push from the default branch. When changes already
sit on it, first compare local and remote history and preserve the work on an
appropriate feature branch. Choose the branch base only after determining
whether existing local commits are unique, already upstream under different
commit IDs, or unrelated to the task.

Check both topology and patch equivalence. Ahead/behind counts alone misclassify
commits that were squash-merged. Use the equivalent of:

```text
git rev-list --left-right --count HEAD...@{upstream}
git rev-list --left-right --count --cherry-pick HEAD...@{upstream}
git log --left-right --cherry-pick --oneline HEAD...@{upstream}
git cherry -v @{upstream} HEAD
```

Adapt the comparison when a new branch has no upstream. If an upstream is gone,
verify whether the remote branch was merged or deleted before selecting a new
target. If histories diverge, explain the unique and patch-equivalent commits
and stop before pushing until the safe reconciliation is clear.

Never use plain `git pull`; its behavior depends on ambient configuration and
can introduce an unwanted merge. Use an explicit fast-forward-only update when
that is possible. Moving a ref, rebasing pre-existing commits, or dropping a
patch-equivalent commit requires the user's informed approval and a preserved
recovery path.

## Validate and review the intended commit

Derive checks from repository documentation and CI. Run focused checks while
the tree is dirty. If the canonical gate requires a clean tree, create the
reviewed commit first, confirm no unrelated dirt remains, run that gate, and do
not push until it passes. Never hide a failure by weakening a check, accepting
unexplained generated output, or deleting retained evidence.

Stage an explicit path allowlist. Avoid blanket `git add -A` when any unrelated
work exists, and do not force-add ignored files just to include them. Before
committing, review:

- `git diff --cached --name-status` and `git diff --cached --stat`;
- the complete staged patch and `git diff --cached --check`;
- unexpected binaries, generated output, mass line-ending changes, and large
  files;
- secret-sensitive paths and staged additions, without reproducing suspected
  secret values in user-visible output; and
- required tests, documentation, changelog, fixtures, and generated evidence
  that belong to the same public change.

Use the repository's commit-message convention. Keep the subject focused on the
actual diff and do not append a pull-request number that does not yet exist.
Amend only a commit created during the current task, still unpushed, when the
user's requested outcome clearly includes that correction; never rewrite an
older commit implicitly.

After the commit, verify its SHA, subject, author, resulting file set, and patch,
then inspect the worktree state. This catches hook or index effects that differ
from the reviewed staged patch. If a clean-tree gate fails, leave the commit
unpushed and report the exact failure. Change code only when implementation or
fixing validation was already authorized within the original task; a Git-only
request requires asking first.

## Push exactly one feature branch

After validation, fetch immediately before the final divergence calculation,
then push only the current feature branch to the chosen writable remote. Before
executing the push, re-verify the sanitized destination repository and exact
remote ref. For a new branch, prefer the explicit shape `git push
--set-upstream <remote> HEAD`; otherwise verify the configured upstream before
using it.

Do not use `--all`, `--tags`, `--mirror`, or any force option. An explicitly
requested history rewrite on a user-owned feature branch may use an exact
`--force-with-lease=<remote-ref>:<expected-sha>` plus an explicit refspec only
after reading and confirming that remote SHA. Never use an unqualified lease,
and never force the default branch.

Finally, report the pushed commit SHA and subject, local and remote branch,
validation commands and outcomes, and any remaining dirty, stashed, unpushed,
or diverged work. Do not create or merge a pull request unless separately asked.
