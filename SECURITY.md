# Security Policy

Security issues in litefold-calendar are release-blocking.  This policy covers the published package, public JavaScript and CSS contracts, repository-owned examples, and the build and publication workflows.

## Supported versions

litefold-calendar is pre-1.0.  Security fixes are released only for the newest public alpha and the current `main` branch.

| Version | Supported |
| --- | --- |
| Latest `alpha` release | Yes |
| Current `main` | Yes, before the next release |
| Older prereleases, forks, and modified packages | No |

Published npm versions are immutable.  A fix receives a new alpha version; affected older versions may be deprecated with upgrade guidance.

## Report a vulnerability privately

Do not open a public issue, discussion, or pull request for a suspected vulnerability.  Use [GitHub private vulnerability reporting](https://github.com/tryagaindev/litefold-calendar/security/advisories/new).

Include the affected version and commit, a minimal reproduction, realistic impact, required attacker capabilities, affected browsers where relevant, and any suggested mitigation or disclosure constraints.  Remove credentials, production event data, private URLs, and unrelated personal information.

When private vulnerability reporting is unexpectedly unavailable, submit only the [reporting-channel unavailable form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=private_security_reporting_unavailable.yml).  Do not include vulnerability facts, screenshots, links, logs, or attachments in that public issue.  Wait for a maintainer to establish a private channel.

The project aims to acknowledge a complete report within three business days and provide an initial assessment or request for more information within ten business days.  Remediation and coordinated disclosure timing depend on severity and release risk.

## Safe research

Good-faith research must use systems and data you own or are authorized to test, minimize access, stop when sensitive data or another person's data is encountered, and avoid persistence, destructive actions, denial of service, social engineering, and supply-chain publication.  Keep details private until disclosure is coordinated.

## Security boundary

The library runs inside an application-controlled browser document.  It does not provide authentication, authorization, networking, persistent storage, HTML sanitization, or an isolation boundary for application code.

Event-source results and ordinary event fields are untrusted input.  Options, callbacks, and extensions are trusted same-realm code with the same authority as the host application.  The application remains responsible for transport security, authorization, recurrence expansion, time-zone conversion, caching, routes, and protection of event data before it reaches the library.

See the canonical [threat model](docs/litefold-calendar-threat-model.md) for trust boundaries, abuse cases, controls, and residual risk.  [docs/security-model.md](docs/security-model.md) remains the stable security-documentation pointer.

## Security invariants

The following properties must hold:

- Published output has no runtime, peer, optional, or bundled dependencies, no lifecycle scripts, and no remote assets.
- Untrusted strings are rendered as text and never interpreted as HTML, script, selectors, styles, or event-handler source.
- `CalendarEventInput.url` is the only core URL input.  It is length-bounded, atomically validated, resolved against the host document, and restricted to relative or HTTP(S) destinations without credentials, control characters, or whitespace changes.
- Event snapshots are strictly and atomically validated before replacing current data.  Count and string limits bound package-owned work.
- Raw causes, stack traces, URLs, payloads, metadata, and private extension identifiers never enter package-owned user-facing error text or sanitized state.
- Superseded or destroyed work cannot update the active calendar.  Owned listeners, timers, controllers, node leases, transient paging state, and extension cleanups are released during teardown.
- Same-realm extension failures are contained where practical, but malicious or blocking extension code is not sandboxed.
- The ESM entry is safe to import without a DOM.  Core runtime code uses no HTML-injection or dynamic-code sinks and creates no inline style attributes.
- Operational failures remain visible and programmatically announced unless the application explicitly takes ownership.  Invalid configuration, arguments, and lifecycle use throw typed errors to the caller.
- Public releases come from clean committed source, a protected version tag contained in `main`, a complete quality gate, an immutable verified bundle, and an npm trusted-publishing job that receives OIDC only after verification.  The publish job checks out no source and publishes the exact verified tarball with provenance.

## Reportable findings

Report realistic paths to compromise an application integration, repository, release artifact, or maintainer privilege.  Examples include DOM or script injection through event data, bypass of the event-link policy, sensitive diagnostic disclosure, resource-bound bypass, cross-instance or stale-generation races, package substitution, workflow privilege escalation, or publication of bytes other than the reviewed tarball.

A development-tool advisory is relevant when it can affect CI, repository integrity, or published output.  A version match without a reachable path is not sufficient by itself.

## Out of scope and accepted limitations

The following are not vulnerabilities unless litefold-calendar adds an unexpected privilege boundary or violates a documented guarantee:

- Malicious application code or extensions already executing in the same JavaScript realm.
- Main-thread blocking caused solely by trusted callback or extension code.
- Browser, assistive-technology, npm, or GitHub platform defects outside this repository's configuration.
- Unsupported browsers, modified distributions, forks, or downstream CSS that removes required states.
- Automated dependency reports without a demonstrated path through development, CI, or release infrastructure.
- Social engineering, physical access, volumetric denial of service, or attacks against infrastructure outside project control.

When uncertain, report privately.
