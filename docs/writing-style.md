# Writing clear documentation and interface copy

Use this guide when writing documentation, contributor templates, diagram
descriptions, or explanatory copy in examples and the published site. Start with
the reader's task, then give them the information needed to complete it.

## Write for the intended reader

Write general guidance for high-school graduates, at about a grade-12 reading
level. Use simpler language when it fits. This target concerns the writing;
it does not assume that every reader has the same programming knowledge.

Keep technical terms and familiar phrases that the intended audience is likely
to understand. For example, authentication and authorization name different
concepts; replacing both with “access” would lose meaning. Explain a term when
the reader needs it, rather than defining every familiar term on every page.

Advanced pages and deep API references may require more knowledge and more
precise language. Keep that detail when the task warrants it. Even then, name
the actor, make conditions clear, and separate decisions the reader must make.

Use the [documentation audiences](../CONTRIBUTING.md#documentation-audiences)
to choose the page's primary reader. A first-render tutorial, an API reference,
and a release recovery procedure have different jobs.

## Lead with the task and result

Start a page or section with what the reader can do, when they need it, or what
will happen. Put required assumptions before the steps they affect. Keep
optional background after the main path or link to it.

**Before:** “The example provides an illustration of asynchronous data-source
integration and the associated range-dependent filtering capabilities.”

**After:** “Use this example to load events from your service and filter them
without recreating the calendar.”

The revision names the task and its result. It leaves the implementation detail
for the recipe that follows.

## Name the actor and separate conditions

Prefer direct verbs: “The calendar retains the snapshot” tells readers who does
what. Avoid making them infer the actor from phrases such as “snapshot retention
is performed.” Use “you” for a reader's action and name the application, calendar,
provider, or workflow when it owns the action.

Give each paragraph one purpose. Separate the normal path from conditions,
exceptions, and recovery. Put each condition beside the behavior it controls.

**Before:** “Fallback visibility is coordinated upon the availability of usable
data, including empty results, with retention during degraded refreshes and
restoration of the original hidden state when no usable snapshot remains in an
unavailable or fatal state.”

**After:**

- The first usable snapshot hides the fallback, even when it contains no events.
- A degraded refresh keeps the fallback hidden while usable data remains.
- An unavailable or fatal state with no usable snapshot restores the fallback's
  original `hidden` state.

The revision separates three outcomes without changing their conditions. An
explanation of application overrides and teardown belongs after these rules.
See the [fallback contract](api.md#application-integration-options) for all rules.

## Choose a structure that matches the work

Use numbered steps when order matters. Give each step an action and the result
that lets the reader continue. Use bullets for independent checks. Use a table
when readers compare choices or select an action from a known state.

**Before:** “If a release deployment failed, locate its run and follow recovery,
or if no run exists inspect the handoff, accounting for whether source changes
are needed before choosing a retry.”

**After:**

| Observed state | Next action |
| --- | --- |
| A release deployment run exists and failed | Follow the failed-run recovery procedure. |
| No release deployment run exists | Check the publication-to-deployment handoff. |
| Recovery needs different source or built bytes | Follow the new-version path; do not replace an immutable release. |

This table makes the first decision easy to find. It does not replace the
[release deployment recovery procedure](example-deployment.md#recover-an-inconsistent-release-deployment),
which supplies the required permissions, identities, and exact steps.

Keep checklist items independently verifiable.

**Before:** “Check narrow layout, long labels, target sizes, focus retention,
keyboard order, and reflow with text enlargement.”

**After:**

- At the specified narrow width, confirm that long labels wrap without clipping.
- Measure the control targets against the documented minimum size.
- Resize while a control has focus; confirm that focus follows the documented rule.
- Enlarge text and confirm that the page still reflows.
- Use the keyboard to confirm the expected focus order.

Each check now has an observable result. Keep the exact widths, sizes, and focus
rules beside the relevant check or link to their authoritative specification.

## Reuse familiar terms and phrases

Use the same term for the same concept across the API reference, guides,
examples, and site. Repeat short contract phrases when they help readers recognize
the rule. Do not alternate between synonyms merely to make the prose sound varied.

Keep API names, status values, error codes, command names, workflow names, and
established control labels exact. An explanation may use simpler language around
those names without replacing them.

The table below helps writers preserve distinctions. Follow the linked contract
for full definitions and behavior.

| Terms | Distinction to preserve | Contract |
| --- | --- | --- |
| Static event array; provider | `CalendarEvents` accepts an array or a provider. `CalendarEventSource` is the callable provider type, not the array form. | [Supply events](api.md#supply-events-calendarevents-and-calendareventsource) |
| Event; occurrence | One event may span several dates. An occurrence refers to that event on a particular date; state which unit a count describes. | [Event data](api.md#define-events-calendareventinput-and-calendarevent) |
| Displayed month; selected date; visible range | These identify the month shown, the date driving the agenda, and the full source range. Selection bounds do not shorten the fixed 42-day source range. | [State](api.md#observe-state-calendarstate) and [source timing](api.md#source-timing-and-renders) |
| Usable snapshot; retained usable snapshot | A successful empty result is usable. Retained same-range data after a failed refresh does not imply a package cache. | [State](api.md#observe-state-calendarstate) and [remote-data recovery](remote-data.md#4-keep-empty-and-error-states-distinct) |
| Total-count button; additional-count cue; overflow action | A total, a passive cue for additional events, and an interactive overflow action are not interchangeable. | [User actions](api.md#handle-user-actions-calendaraction) and [responsive design](../DESIGN.md#responsive-model) |
| Publication; deployment | Publishing the package does not by itself complete its Pages deployment. | [Release completion](releasing.md#readiness-and-completion) |
| Rolling main preview; immutable release | A rolling preview and a release snapshot have different identity and recovery rules. | [Deployment identity](example-deployment.md#url-and-identity-contract) |

## Keep one complete specification

Each contract has one canonical document: the place readers go for its complete
rules. Other pages should summarize the decision their audience needs to make
and link to that document.

This does not forbid repetition. Repeat a familiar term, a short warning, or a
required setup detail when a guide needs it to stand alone. Keep repeated wording
aligned with the full contract. Avoid copying command inventories, signature
lists, responsive geometry, or recovery matrices into several documents.

Use links that name what the reader will find.

**Before:** “The API guide owns source timing.”

**After:** “See [source timing and renders](api.md#source-timing-and-renders)
for synchronous and asynchronous provider behavior.”

Keep existing heading anchors when reorganizing a page. If a heading must change,
retain its old anchor explicitly so external links still work.

## Write useful interface explanations

State what happened and what the user can do next. Distinguish an empty result
from missing information or a failed request. Do not claim a version, successful
save, or completed deployment when the application cannot verify it.

**Before:** “Exact provenance resolution is unavailable.”

**After:** “Build details could not be loaded. Source links still open the main branch.”

The revision names the missing information and explains which action remains
available. Keep established button names and accessible labels unchanged when
editing nearby explanations. Test long labels, narrow layouts, and enlarged text.

## Version references

Do not repeat exact package or runtime patch versions in prose. Name the
supported major or release line and link to the authoritative manifest,
lockfile, generated metadata, or executable configuration.

Supported ranges and major selectors belong in repository configuration. Exact
resolved versions belong in lockfiles, generated receipts, capture metadata,
and commands that require the exact value as input.

## Scope and history

Write standing guidance around current situations, rules, decisions, and
reusable recovery actions. Do not use a past event, tag, commit hash, or individual
outcome as the reason for a standing rule.

Record shipped product changes in `CHANGELOG.md`. Keep event-specific chronology
and sensitive operational evidence in the relevant issue, private release record,
or postmortem. Do not rewrite historical claims as part of a readability edit.

## Diagrams and text equivalents

Use a diagram when it makes a relationship easier to understand. Keep the nearby
prose or table as the complete text equivalent and canonical contract.

- Use fenced Mermaid flowcharts or sequence diagrams for dependency direction,
  event order, and lifecycle. Every Mermaid block needs a concise `accTitle` and
  `accDescr`.
- Use an annotated SVG under `docs/assets/` for spatial placement or component
  anatomy. Give it useful Markdown alternative text and explain every callout in
  nearby prose or a table. Its source must include a maintenance comment naming
  the canonical code and documentation, plus the changes that require asset review.
- Let the renderer choose Mermaid colors and styling. Use labels, arrows, shapes,
  and text to communicate meaning, rather than color alone. Check static assets
  against the repository's light and dark presentation.
- Do not use Mermaid frontmatter, embedded HTML, initialization/configuration
  directives, or `click` directives. Use ordinary Markdown links for navigation.
- Show stable concepts, public vocabulary, and ownership boundaries. Do not copy
  exhaustive module inventories, private selectors, incidental DOM order, or
  other details that would create a second source of truth.

## Review wording without changing the contract

Read the revised passage as its intended audience. Can that reader find the
action, condition, expected result, and recovery path? Check advanced passages
for avoidable complexity while keeping necessary detail and familiar terms.

Before finishing a copy edit:

- Compare defaults, limits, ordering, permissions, and failure conditions with
  the original contract.
- Check related guides and examples for consistent terms and repeated phrases.
- Preserve existing identifiers, control labels, and external anchors.
- Review links, tables, diagrams, narrow layouts, and enlarged text as applicable.
- Run the [focused checks](../CONTRIBUTOR_COMMANDS.md#choose-focused-validation)
  and follow the [final gate](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate).

Legal content is outside readability editing. Keep `LICENSE` and
`CODE_OF_CONDUCT.md` unchanged, including formatting, links, and attribution.
Keep legal clauses elsewhere verbatim and in place, including licensing, rights,
consent, confidentiality, retention, liability, and legal obligations. Do not
replace them with summaries. Edit surrounding technical explanations only.
