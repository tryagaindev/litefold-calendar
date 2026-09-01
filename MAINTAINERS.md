# Maintainers

## Maintainership

The `@TryAgainDev/maintainers` GitHub team is accountable for project direction,
review, and policy. Security response, npm publication, protected-environment
approval, and repository administration additionally require the corresponding
system permission. The project currently has one maintainer:
[Basi Angulo (`@redbasi`)](https://github.com/redbasi).

## Project and platform roles

- A **package user** evaluates or integrates the published package. This audience
  has no repository permission by default.
- A **contributor** proposes or supplies code, documentation, issues, reviews,
  testing, or support. Contribution does not imply repository access.
- A **maintainer** is a trusted project steward responsible for direction,
  review, merge decisions, and policy. This project role is distinct from
  GitHub's `Maintain` repository role, and team membership alone grants no npm,
  security, environment, or GitHub `Admin` authority.
- An **eligible maintainer** is a non-conflicted maintainer who holds the
  permission needed for the decision. For required independent review, that
  maintainer must also not be the change author.
- A **release operator** coordinates the repository's documented release
  procedure. The role grants no permission by itself.
- A person with **Admin access** holds GitHub's `Admin` repository role.
  **Organization owner** and **security manager** are separate GitHub
  organization roles.
- A **required reviewer for an environment** is a person or team configured in
  that GitHub environment's deployment protection rules.
- An **npm package maintainer** is an account listed by `npm owner ls` with
  permission to publish versions and manage package metadata. This role is
  separate from project maintainership.
- A **Community Moderator** is a non-conflicted person explicitly assigned to
  handle a Code of Conduct report. This project policy role does not grant
  GitHub's separate organization `Moderator` role or any platform permission.

Authorization for one project or platform role does not imply another.

## Responsibilities

Maintainers are expected to:

- Triage issues and pull requests, enforce the documented public, accessibility, security, and package contracts, and explain material tradeoffs.
- Require repository checks and relevant manual evidence before merge; maintainer-authored changes follow the same gate as community changes.
- Follow the [alpha release operations runbook](docs/release-operations.md), [release policy](docs/releasing.md), and [release administration guide](docs/release-administration.md) for publication work.
- Handle suspected vulnerabilities through [SECURITY.md](SECURITY.md) and keep sensitive reports out of public issues.
- Keep [CODEOWNERS](.github/CODEOWNERS), team membership, and repository or registry access aligned with current responsibilities.

## Decision making

Community input and evidence are welcome. Eligible maintainers make final
technical, security, governance, and release decisions. Material decisions
should preserve documented alpha guarantees and explain important tradeoffs in
issues or pull requests. Code of Conduct reports follow the separate assignment
and recusal rules below.

When a maintainer authors a change or operates a release and no other eligible
maintainer is available, independent maintainer approval is impossible and the
hosted policy must avoid deadlock while preserving all other checks. Changes
authored by contributors can still require approval from the sole eligible
maintainer. When multiple eligible maintainers are available, protected branches
and release environments require at least one non-author approval.

## Code of Conduct response

Private Code of Conduct reports are received at
[conduct@tryagain.dev](mailto:conduct@tryagain.dev). The dedicated mailbox is
read only by Basi Angulo, the current maintainer; it must be protected with
multi-factor authentication and must not forward into a general team mailbox or
mailing-list archive. Conduct reports remain separate from vulnerability reports.

For a report that does not name, involve, or create a material conflict for the
maintainer, Basi is the assigned Community Moderator. The project aims to
acknowledge reports within three business days. The assigned Community Moderator
collects only the information needed to assess scope, immediate safety, and an
appropriate response; keeps case records outside the public repository with
access limited to the person handling the report; and retains them no longer
than needed for the response or a legal or safety obligation.

Report information is disclosed only as needed for a fair response. The reporter
is told before a disclosure when possible, and the project does not intentionally
identify the reporter to the reported person without consent except where law or
an immediate-safety obligation requires a limited disclosure. Complete
anonymity cannot be guaranteed because the facts may identify participants.

Anyone who recognizes that they are named in or materially connected to a report
must stop reviewing further details and recuse from investigation, enforcement,
and appeal. Access needed to recognize the conflict cannot be undone. While the
project has one maintainer, a report involving that maintainer has no independent
internal moderator or appeal and cannot proceed through the project process. A
reporter who does not want the maintainer to receive sensitive details must not
use the project mailbox. GitHub-hosted conduct can instead be reported to GitHub
Support through
[GitHub's abuse-reporting process](https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam).
If GitHub offers a choice, select **Report abuse to GitHub Support**, not
**Report to repository admins**. Report npm-hosted conduct through
[npm Support](https://www.npmjs.com/support), and conduct in another
hosted service or event through that host's private reporting process. Those
services apply their own policies and are not project-appointed adjudicators.
The project never requests conduct-report details in a public issue.

Adding a maintainer does not automatically grant access to the conduct mailbox.
Before another person receives reports, this policy must name the recipients and
define mailbox access, authority, confidentiality, and recusal. Before the
project represents independent review or appeal as available, a non-implicated
reviewer must be able to receive the report without exposing it to the implicated
person, and the appeal path must be documented.

## Adding or removing maintainers

As the contributor community grows, additional maintainers may be appointed
through the TryAgainDev GitHub organization based on
sustained, constructive contributions, sound judgment, security awareness, and
willingness to support the project. Changes to this file and CODEOWNERS require
approval from an organization owner. This is a human governance decision recorded
in the pull request; CODEOWNERS alone does not enforce or prove it. Access should
be removed promptly when responsibilities end.

When another active maintainer is appointed, update the current maintainer list,
team membership, CODEOWNERS, required pull-request approvals, required reviewers
for release environments, and the conduct-response policy together. Require a
non-author approval for protected branches and releases whenever another
eligible maintainer is available.

Release and repository permissions follow least privilege. npm publishing, security advisory, branch-protection, and GitHub Actions administration access are granted separately as needed; membership in the GitHub team does not itself grant registry access.
