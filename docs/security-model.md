# Security model

## Executive summary

litefold-calendar has three primary risk centers:

1. Untrusted event data crossing into an application's DOM, navigation, and error surfaces.
2. Optional WebMCP arguments and structured calendar results crossing between a browser agent and a live calendar instance.
3. Repository changes crossing into public npm, GitHub release, and example-site artifacts.

Runtime controls emphasize atomic validation, non-executable rendering, restricted links, bounded work, asynchronous generation guards, lifecycle isolation, and visible failures. WebMCP remains explicit, bounded, same-origin, and tied to render/destroy ownership. Supply-chain controls preserve exact-source verification, immutable artifacts, isolated publication authority, provenance, and post-publication identity checks.

## Scope and assumptions

In scope are `src/`, distributed ESM/CSS output, `scripts/`, `.github/workflows/`, repository configuration, repository-owned examples, and optional WebMCP registrations created by the package. Tests provide evidence but are not shipped runtime code.

The model assumes:

- The library runs in a modern browser inside an application-controlled document.
- Event records, provider timing, rejection values, URLs, colors, metadata, WebMCP inputs, and returned event titles can be attacker-influenced.
- Options, callbacks, and extensions are trusted same-realm application code. Failure containment is in scope; sandboxing JavaScript is not.
- Event data may be confidential. Titles are intentionally rendered; when WebMCP is enabled, paged results can enumerate every source event intersecting an allowed date in the loaded visible range and include title plus raw normalized start/end civil values regardless of visual time settings. Metadata, URLs, identifiers, and raw diagnostic causes remain excluded from site-tool output.
- Application transports, authentication, authorization, tenant isolation, recurrence, time-zone conversion, caching, routes, and server-side limits remain application responsibilities.
- GitHub and npm protections are external controls. Repository files describe required configuration but cannot prove that hosted settings are enabled.

## Components and trust boundaries

| Boundary | Data or authority crossing it | Primary controls |
| --- | --- | --- |
| Application event source → core | Event arrays, timing, failures, URLs, metadata | Abort signal, complete-range contract, strict atomic normalization, duplicate rejection, count/string bounds, safe URL policy |
| Browser user → calendar DOM | Keyboard, pointer, touch, pen, and precision-scroll input | Native controls, managed grid semantics, guarded actions, focus identity, bounds, one interactive grid |
| Calendar → application callbacks | Normalized events, dates, DOM references, state, errors | Typed contexts, safe presentation/diagnostic separation, observed promises, lifecycle guards |
| Trusted extension → owned slots | Same-document nodes and cleanup code | Node leases, ownership checks, abort signals, cleanup, failure quarantine; no sandbox claim |
| Browser agent → WebMCP adapter | Tool names, untrusted structured arguments, read/navigation requests | Explicit opt-in, prefix validation, exact schemas, bounds and paging validation, existing public navigation paths, no application-action tools |
| WebMCP adapter → browser agent | Paged visible-range state and presentation-safe source-event fields | Same-origin document registry, untrusted-content annotation, allowed-date filtering, no ID/URL/metadata/cause output, result limits, unregister on teardown |
| Contributor → CI | Source and workflow changes | Read-only pull-request permissions, full-SHA actions, no `pull_request_target`, locked script-disabled install, lint/type/policy/tests |
| Exact release commit → retained artifacts | Reviewed source and build tooling | Complete gate, clean-source package build, checksums, integrity, receipt, SBOM, license, attempt-scoped artifacts |
| Verified artifact → npm | Exact tarball and OIDC identity | Protected `npm` environment, source-free publisher, hash/receipt/manifest validation, trusted publishing, provenance, post-publish verification |
| Verified release state → Git tag and GitHub prerelease | Tag and release-write authority | Protected exact-SHA tag, draft-first assets, matching-byte reuse only, immutable release setting, public prerelease last |
| Verified static snapshot → GitHub Pages | Built examples, rolling preview, immutable release paths | Self-contained asset scan, visible identity, retained history, byte-different overwrite rejection, protected Pages authority |

```mermaid
flowchart LR
  U[Browser user] --> C[Calendar core]
  S[Application event source] --> C
  C --> D[Application DOM]
  C --> A[Application callbacks]
  M[Browser agent] --> W[Opt-in WebMCP adapter]
  W --> C
  C --> W
  E[Trusted extensions] --> C
  P[Pull request] --> V[Read-only CI]
  V --> R[Exact main release commit]
  R --> B[Verified artifacts]
  B --> N[Protected source-free npm publish]
  N --> G[Immutable GitHub prerelease]
  G --> Q[Separately queued Pages release]
```

## Assets and objectives

| Asset | Objective |
| --- | --- |
| Application DOM and navigation | Prevent untrusted content from becoming executable markup, style, selector, handler, or unsafe URL |
| Event data and metadata | Avoid accidental disclosure and stale or wrong-range presentation |
| Calendar state and ownership | Prevent races, detached-node activation, stale tool calls, and cross-instance cleanup |
| Main-thread capacity | Bound package-owned parsing, rendering, and site-tool result construction |
| Error and recovery channel | Keep failures visible, safe, and recoverable |
| WebMCP registry | Prevent name replacement and stale or unintended exposure; roll back registrations after observed failures |
| Source, tarball, receipts, npm identity, tags, releases, and examples | Publish only reviewed bytes from the intended repository and exact successful commit |
| GitHub, Pages, and npm authority | Keep source execution, repository writes, release writes, Pages authority, and npm OIDC narrowly scoped |

## Attacker capabilities

An attacker may control one or more event fields, provider timing or rejection, duplicate or oversized results, metadata objects, ordinary browser input, or arguments sent through an enabled site tool. Event titles returned by `get-events` remain untrusted model content. A malicious contributor may submit source or workflow changes intended to add a dependency, lifecycle hook, unsafe sink, stale registration, or privileged pull-request path. An external actor may attempt package-name confusion or account compromise.

The attacker is not assumed to already control host application code, trusted extensions, the application origin, GitHub administrators, npm maintainers, or the browser platform. Those compromises cross a different trust boundary.

## Abuse cases and controls

| ID | Abuse case | Existing controls | Residual risk / required follow-up |
| --- | --- | --- | --- |
| TM-001 | Event text, color, metadata, or URL becomes executable content or unsafe navigation | Text-node rendering; exact date/color/URL validation; sink scans; hostile-input tests | Trusted extensions can intentionally create arbitrary DOM; keep them reviewed |
| TM-002 | Oversized data or tool paging freezes the page | Event, string, range, rendering, tool-page, and output bounds; abort-aware source | Application parsing and transport occur before package validation; enforce server/query limits |
| TM-003 | Slow or superseded work commits stale data or acts through detached nodes | Abort controllers, generation checks, leases, expected-parent cleanup, lifecycle guards | Same-realm application code can still mutate owned DOM; preserve race and teardown tests |
| TM-004 | Callback or extension failure hides errors or creates an unhandled rejection | Safe default panel/live regions, exact handled disposition, promise observation, sanitized state, quarantine | Applications can deliberately suppress their own UI; document ownership clearly |
| TM-005 | Malicious same-realm extension reads data, mutates DOM, or blocks execution | Explicit trusted-code boundary, scoped elements, abort/cleanup, node ownership | No browser-realm sandbox; do not accept untrusted extension code |
| TM-006 | Enabling WebMCP discloses more calendar data than intended | Default-off option, same application source authorization, pages of distinct eligible source events from the allowed portion of the loaded visible range, no metadata/URL/ID output, explicit privacy guidance | Titles and raw normalized start/end civil values are intentionally exposed even when visually hidden; applications must opt in only where appropriate |
| TM-007 | A model bypasses bounds, invokes application actions, or causes unbounded fetches | Exact schemas, argument and bounds validation, read-only annotation, one non-read navigation tool, no activation/edit tools, existing source generations | Navigation may request another authorized month; providers must remain safe to repeat |
| TM-008 | Duplicate, partial, or stale registrations target the wrong calendar | Stable unique prefix, document-wide collision failure, one shared abort signal, rollback after an observed failure, unregister on destroy, lifecycle checks in handlers | WebMCP has no atomic batch or timeout, so a never-settling registration cannot be made atomic; application code can separately register conflicting names |
| TM-009 | Pull-request code gains npm, tag, release, or Pages authority | Read-only PR defaults, pinned actions, no `pull_request_target`, separate protected environments/jobs, immutable release checks | Hosted rulesets, approval, and environment configuration remain external controls |
| TM-010 | Release publishes bytes or identity other than the reviewed commit | Exact `push` SHA, deterministic release-state diff, checksums/integrity/receipt/SBOM, source-free OIDC publisher, registry verification, exact tag and immutable release | npm publication is irreversible; defective versions are deprecated and replaced |
| TM-011 | Retried publication or Pages deployment creates conflicting public state | Matching-byte/identity recovery, no version/tag reuse, retained Pages history, immutable release directories, public identity verification | Ambiguous external state must fail closed and require maintainer review |

## Severity calibration

- **Critical:** untrusted event, model, or pull-request input can reliably execute code or publish without another privileged action.
- **High:** compromise can affect many consumers, release identity, or confidential event data but requires a protected account or realistic integration boundary.
- **Medium:** attacker-influenced data causes repeatable integrity, confidentiality, or availability loss within one host.
- **Low:** impact requires already-trusted same-realm code or is local, visible, and readily recoverable.

Release-authority paths remain the highest supply-chain priority. Executable rendering remains the highest ordinary runtime priority. Unexpected WebMCP disclosure is high when it crosses an authorization or tenant boundary and otherwise calibrates to the sensitivity and breadth of exposed event content.

## Review focus

| Path | Security responsibility |
| --- | --- |
| `src/internal/domain/` | Untrusted snapshot parsing, URL policy, civil dates, ranges, resource bounds |
| `src/internal/runtime/` | Generations, actions, state, extensions, WebMCP lifecycle, teardown, diagnostics |
| `src/internal/dom/` | Semantic structure, managed focus, native interaction, non-executable content |
| `src/errors.ts` | Safe user messages and diagnostic separation |
| `scripts/check-package-policy.mjs` | Manifest, import, sink, dependency, built-output, and workflow policy |
| Release preparation and verification scripts | Atomic version/changelog transition, exact source state, collision and resume decisions |
| `scripts/pack-release.mjs` | Clean-source tarball, integrity, receipt, SBOM, license, consumer verification |
| Pages build and assembly scripts | Self-contained assets, visible identity, retained releases, rolling preview, immutable paths |
| `.github/workflows/ci.yml` | Pull-request and main verification without publication authority |
| `.github/workflows/prepare-alpha.yml` | Default-branch preparation and generated release-state branch without publication authority |
| `.github/workflows/publish-alpha.yml` | Exact-`push` release classification, artifact handoff, isolated trusted publishing, tag and prerelease creation |
| `.github/workflows/deploy-examples.yml` | Rolling previews, separate release deployment, retained history, rollback, and isolated Pages authority |

## Validation expectations

Every security-relevant change should preserve hostile-input, async race, teardown, cross-instance, safe-link, error-presentation, WebMCP schema/annotation, disclosure, collision, cleanup, package-policy, clean-consumer, static-deployment, recovery, and workflow-authority assertions.

External GitHub, Pages, npm, browser origin-trial, and ChatGPT workspace settings must be verified in their owning systems rather than inferred from repository tests. The historical `v0.1.0-alpha.0` tag predates the automated protected-tag and immutable-release policy and is not evidence that later tags may be moved or recreated.

Operational publication controls are documented in [release administration](release-administration.md); artifact evidence is defined in [package verification](package-verification.md); Pages procedures belong to [static example deployment](example-deployment.md); WebMCP-specific integration and privacy guidance belongs to the [site-tool guide](webmcp.md).
