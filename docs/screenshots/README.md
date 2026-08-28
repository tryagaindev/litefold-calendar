# Screenshot contract

Screenshots are deterministic release artifacts generated from repository-owned examples with pinned Chromium. They document public behavior; they are not a substitute for browser assertions, accessibility automation, or manual assistive-technology testing.

## Canonical scenes

The manifest covers exactly these PNG files:

| File | Scene | Viewport |
|---|---|---|
| `desktop-month-grid-1440x900.png` | Wide advanced month grid with direct event actions and overflow | 1440 × 900 |
| `month-year-jump-1280x800.png` | Open native month-and-year chooser at a bounded month | 1280 × 800 |
| `mobile-month-agenda-dark-390x844.png` | Compact dark navigation, month grid with multiple-event cue, and selected-day agenda | 390 × 844 |
| `mobile-month-swipe-pull-390x844.png` | Held native touch pull revealing the decorative adjacent-month lane | 390 × 844 |
| `event-details-dark-1280x800.png` | Application-owned event details dialog opened from the agenda | 1280 × 800 |
| `grid-event-keyboard-focus-1440x900.png` | Visible keyboard focus on a wide-layout grid event action after F2 | 1440 × 900 |

JPEG predecessors are obsolete. Do not add alternate crops, renamed duplicates, consumer branding, private data, or externally supplied reference images to this directory.

## Update captures

From a clean repository with a current stable Node 24.x runtime, the repository-selected npm client, and Playwright Chromium installed:

```sh
npm ci --ignore-scripts
npm run build
npm run screenshots:update
npm run check:screenshots
```

`screenshots:update` starts the repository-owned local server, sets deterministic locale, time zone, color scheme, reduced motion, clock/data fixtures, viewport, and interaction state, then writes the six PNGs and their manifest records. Five scenes verify settled states; the held-pull scene intentionally captures direct manipulation before release so the decorative paging affordance receives deterministic visual review. Selection timing and post-release browser physics remain browser-test and supported-device concerns. Do not hand-edit or recompress generated PNGs.

Review each image at native dimensions. Confirm focus, selection, Today, overflow, compact navigation, one-line month title, event marker, agenda, dialog, and month-picker states match their scene. In the settled 390px scene, verify the built-in controls share their compact row above application toolbar content; the default stacked-card cue appears beside the custom `1.25rem` marker without intersection; and no pager lane, offset, motion residue, clipping, or horizontal scrollbar remains visible. Review the cue in both text directions and with the dark, forced-colors, and increased-contrast treatments; browser coverage remains responsible for the generic inline-end satellite case, 200% text, and 400% zoom behavior. In the held-pull scene, verify only one live grid is present and the exposed lane shows the correct arrow and localized adjacent month without event content. Inspect for system-font drift, unexpected network content, and personal or secret data.

## Manifest and validation

The screenshot manifest is machine-owned and records, for every scene:

- Canonical filename and scene identifier.
- Example URL and deterministic setup steps.
- Viewport and output dimensions.
- SHA-256 hash.
- Source fingerprint covering the relevant example, package CSS/behavior, capture code, and pinned browser inputs.
- Exact Node patch used for capture; validation accepts that provenance when it belongs to major version 24, while npm, Playwright, and Chromium remain exact-pinned.
- Documentation references and exact alt text.

`check:screenshots` fails when a canonical scene is absent, dimensions or hash differ, the source fingerprint is stale, a documented reference or alt text is missing, or an orphaned screenshot asset exists. A deliberate visual change must update implementation, captures, manifest, references, and alt text together.

Never bless unexplained diffs. If the source did not intentionally change, investigate browser/toolchain drift, nondeterministic fixtures, fonts, animation, layout timing, or an unexpected network dependency before updating hashes.
