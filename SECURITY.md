# Security Policy

Use this policy to report a suspected vulnerability in the published package, public JavaScript or CSS contract, repository-owned examples, or build and publication workflows. Security issues are release-blocking.

## Supported versions

Litefold Calendar is pre-1.0.  Security fixes are released only for the newest public alpha and the current `main` branch.

| Version | Supported |
| --- | --- |
| Latest `alpha` release | Yes |
| Current `main` development state | Yes, before the next release |
| Older prereleases, forks, and modified packages | No |

Published npm versions are immutable.  A fix receives a new alpha version; affected older versions may be deprecated with upgrade guidance.

## Report a vulnerability privately

Do not open a public issue, discussion, or pull request for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/tryagaindev/litefold-calendar/security/advisories/new).

Include:

- The affected package version and source commit.
- A minimal reproduction or precise steps.
- The realistic impact and attacker capabilities required.
- Affected browsers or integrations, when relevant.
- Suggested mitigations or disclosure constraints, if any.

Remove credentials, production event data, private URLs, and unrelated personal information before submitting.

If private vulnerability reporting is unexpectedly unavailable, submit only the [reporting-channel unavailable form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=private_security_reporting_unavailable.yml). Do not include vulnerability facts, screenshots, links, logs, or attachments in that public issue. Wait for a maintainer to establish a private channel.

The project aims to acknowledge a complete report within three business days and provide an initial assessment or request for more information within ten business days.  Remediation and coordinated disclosure timing depend on severity and release risk.

## Safe research

Good-faith research must use systems and data you own or are authorized to test, minimize access, stop when sensitive data or another person's data is encountered, and avoid persistence, destructive actions, denial of service, social engineering, and supply-chain publication.  Keep details private until disclosure is coordinated.

## Integration security boundary

The library runs inside an application-controlled browser document. It does not provide authentication, authorization, networking, persistent storage, HTML sanitization, or an isolation boundary for application code.

Treat event-source results and ordinary event fields as untrusted input. Options, callbacks, and extensions are trusted same-realm code with the host application's authority. The host application remains responsible for:

- Transport security and authorization.
- Recurrence expansion and time-zone conversion.
- Caching and routing.
- Protecting event data before it reaches the library.

WebMCP is an explicit, default-off same-document integration. Its arguments are untrusted, and enabling it intentionally exposes paged event titles plus raw normalized start/end civil values for the allowed portion of the currently loaded visible range to a compatible browser agent, even when `eventTimeDisplay` hides time visually. Grid density, overflow, and agenda rendering limits are not authorization filters and do not narrow otherwise eligible tool results. WebMCP grants no server permission and excludes identifiers, URLs, metadata, extensions, raw errors, and application actions. Review the [WebMCP privacy guidance](docs/webmcp.md#privacy-and-security) before enabling it for confidential schedules.

See the canonical [security model](docs/security-model.md) for trust boundaries, abuse cases, controls, and residual risk.

## Security invariants

The following properties must hold:

### Runtime and integrations

- Published output has no runtime, peer, optional, or bundled dependencies, no lifecycle scripts, and no remote assets.
- Untrusted strings are rendered as text and never interpreted as HTML, script, selectors, styles, or event-handler source.
- `CalendarEventInput.url` is the only core URL input.  It is length-bounded, atomically validated, resolved against the host document, and restricted to relative or HTTP(S) destinations without credentials, control characters, or whitespace changes.
- Event snapshots are strictly and atomically validated before replacing current data.  Count and string limits bound package-owned work.
- Raw causes, stack traces, URLs, payloads, metadata, and private extension identifiers never enter package-owned user-facing error text or sanitized state.
- Superseded or destroyed work cannot update the active calendar.  Owned listeners, timers, controllers, node leases, transient paging state, and extension cleanups are released during teardown.
- WebMCP never registers without explicit configuration. Tool arguments are schema- and bounds-validated; event output is fixed-page, marked untrusted, and excludes IDs, URLs, metadata, and diagnostics. Opaque continuations bind the activation, range, scope, next offset, and current snapshot; superseded event payloads are not cached to satisfy stale cursors.
- Both WebMCP registrations share one abort signal. An observed registration failure aborts that signal, and teardown ends both registrations, including navigation teardown before a pending waiter is installed. The experimental browser API provides no atomic batch or registration timeout. The navigation tool cannot activate application callbacks or event destinations.
- Same-realm extension failures are contained where practical, but malicious or blocking extension code is not sandboxed.
- The ESM entry is safe to import without a DOM.  Core runtime code uses no HTML-injection or dynamic-code sinks and creates no inline style attributes.
- Operational failures remain visible and programmatically announced unless the application explicitly takes ownership.  Invalid configuration, arguments, and lifecycle use throw typed errors to the caller.

### Build and release

- Public releases originate from the exact eligible `main` push containing an allowlisted deterministic release-state change. The publisher reruns the complete gate for that exact SHA. Retained evidence includes a canonical SPDX 2.3 SBOM bound to the package version, full source SHA, and source-commit time; under the pinned toolchain, its bytes are deterministic for the same clean commit.
- Source execution and publication authority never coincide.  Verification has read-only repository access and no npm or Pages OIDC.  The npm-authorized job checks out no source, installs or imports no candidate package, executes no project code, and publishes only the checksum-verified retained tarball.  Registry verification, repository writes, and Pages deployment remain separately scoped.
- Remote release state fails closed.  Unavailable, ambiguous, conflicting, or malformed npm, authenticated GraphQL, GitHub, or Pages state never authorizes a transition.  Registry completion independently verifies exact integrity, a clean installation and supported imports, signatures, and SLSA provenance bound to the artifact and exact source identity.
- Automatic rolling Pages previews move monotonically by source ancestry; only explicit retained-state rollback may move backward. Existing release directories remain immutable. Automatic Pages deployment is `workflow_run`-only, while manual rollback is isolated in a separate `workflow_dispatch`-only workflow that cannot accept a release ref. Rollback reconstructs inside the contents writer from authenticated retained Git objects and the current retained shell; no producer-composed site artifact crosses into write authority. The shared assembler enforces the exact root CSP and rejects remote runtime assets. Both workflows use one non-canceling maximum queue from retained-state validation through deployment, so their writers and deployers cannot interleave. A successful same-repository publisher completion starts release Pages after the registry-verified GitHub prerelease is public, while separately scoped Pages authority performs the deployment.

Operational recovery and hosted controls are defined in [release administration](docs/release-administration.md).  Artifact and registry evidence details remain canonical in [package verification](docs/package-verification.md), and Pages procedures remain canonical in [example deployment](docs/example-deployment.md).

## Reportable findings

Report realistic paths to compromise an application integration, repository, release artifact, or maintainer privilege. Examples include DOM or script injection through event data, bypass of event-link or WebMCP output policy, unauthorized site-tool disclosure or navigation, stale or cross-instance tool registration, sensitive diagnostic disclosure, resource-bound bypass, stale-generation races, package substitution, workflow privilege escalation, or publication of bytes other than the reviewed tarball.

A development-tool advisory is relevant when it can affect CI, repository integrity, or published output.  A version match without a reachable path is not sufficient by itself.

## Out of scope and accepted limitations

The following are not vulnerabilities unless Litefold Calendar adds an unexpected privilege boundary or violates a documented guarantee:

- Malicious application code or extensions already executing in the same JavaScript realm.
- Main-thread blocking caused solely by trusted callback or extension code.
- Browser, assistive-technology, npm, or GitHub platform defects outside this repository's configuration.
- Unsupported browsers, modified distributions, forks, or downstream CSS that removes required states.
- Automated dependency reports without a demonstrated path through development, CI, or release infrastructure.
- Social engineering, physical access, volumetric denial of service, or attacks against infrastructure outside project control.

When uncertain, report privately.
