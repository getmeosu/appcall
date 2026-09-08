# AppCall web contract

This crate renders the Signal web surface. Rust SSR is the source of truth:
keep routes, escaping, forms, and state transitions in Rust. Do not introduce
Go/templ templates, a client framework, a webview, or a new client runtime.
Datastar may swap an existing server-rendered target; it does not own product
state.

## Visual language

- Use the semantic palette in `styles/app.css`: `--color-canvas`,
  `--color-ground`, `--color-panel`, `--color-raised`, `--color-inset`,
  `--color-line`, `--color-line-strong`, and the `--color-ink-*` ramp.
- Use `--color-iris-400` for the single accent (links, focus, and active
  rails). Status colors are semantic only: jade for success, amber for
  warning, rose for error, and sky for running.
- `--color-ink-400` is for non-text boundaries and graphics only. Text uses
  `--color-ink-300` or lighter; body text must reach 4.5:1 and controls or
  non-text indicators 3:1 on their actual surface.
- Use the named typography roles label, caption, body, section, and title.
  Negative tracking is permitted only at 18px and above; section text uses
  zero tracking. Use `font-variant-numeric: tabular-nums` for measurements,
  ages, and identifiers.
- Controls use `--radius-ctl: 4px`; panels use `--radius-panel: 10px`.
  Use the shared `ui-button`, `ui-control`, `ui-state`, `ui-tag`,
  `ui-empty-state`, and `ui-confirm-dialog` primitives. If a primitive is
  missing, add it to `ui.rs` in its own PR. Do not duplicate
  page-local controls or represent status as a pill or tinted table tag;
  status is a rule plus a word.

## Interaction and layout

- Preserve native keyboard and form behavior. Every focusable action has a
  visible `:focus-visible` treatment using `--color-iris-400`; loading actions
  are disabled while in flight and success/error outcomes remain explicit.
- Every Datastar result or error swap target declares its own live-region
  semantics (`role="status"` or `role="alert"`, `aria-live="polite"`, and
  `aria-atomic="true"` where the complete message is replaced).
- Design and check at 375px, 768px, 1024px, and 1440px. Keep content inside
  its container with no accidental page overflow; use a contained scroll
  region only where a wide data table requires it. Preserve 44px touch targets
  on narrow screens.

## Type and provenance

- Fonts are self-hosted and loaded from `/static/fonts/`: Archivo variable
  (`font-weight: 100 900`) and IBM Plex Mono Roman variable
  (`font-weight: 100 700`). Do not add a remote font dependency or declare an
  axis the binary does not contain.
- Asset provenance and licenses belong in `third_party/NOTICE` and the
  corresponding `third_party/licenses/` file. If provider identity, health
  cause, elapsed time, or telemetry provenance is not recorded, render an
  explicit unknown/unavailable value; never infer or fabricate it from
  arbitrary metadata.
