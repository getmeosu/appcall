# Console redesign — implementation spec

Machine-readable companion to the visual canvas. The canvas shows what it looks
like; this file is what you build from. Where the two disagree, this file wins —
it is the one that lives beside the code.

Direction name: **Signal**. Stack is unchanged: Go + `templ` + Datastar +
Tailwind v4, server-rendered, mounted in the API binary. No client framework, no
new dependency, no build step beyond `@tailwindcss/cli`.

---

## 1. Design tokens

Replace the whole `@theme` block in `internal/web/styles/app.css`. Delete the
`prussian-blue`, `space-indigo`, `dusk-blue`, `tropical-teal` and `neon-ice`
ramps — do not alias them, or half the tree will keep using them.

```css
@import "tailwindcss";
@source "../components";
@source "../handlers";

@theme {
  /* ink — every surface and every piece of text */
  --color-ink-950: #08090C;   /* app canvas, code blocks  */
  --color-ink-900: #0C0E12;   /* page ground, input fill  */
  --color-ink-850: #101318;   /* panels, tables           */
  --color-ink-800: #151920;   /* hover, selected row      */
  --color-ink-750: #1A1F27;   /* inset, nested            */
  --color-ink-700: #232833;   /* hairline                 */
  --color-ink-600: #2C323E;   /* border                   */
  --color-ink-500: #666E7D;   /* control boundary — 3:1   */
  --color-ink-400: #737C8C;   /* NON-TEXT ONLY (4.42:1)   */
  --color-ink-300: #98A1B0;   /* muted text, placeholders */
  --color-ink-200: #C2C8D2;   /* secondary text           */
  --color-ink-100: #E3E7ED;   /* body text                */
  --color-ink-50:  #F5F7FA;   /* headings, primary fill   */

  /* iris — the single accent */
  --color-iris-300: #B3ACFF;
  --color-iris-400: #9A90FF;  /* links, focus, active rail */
  --color-iris-500: #7F73F5;
  --color-iris-600: #6759E0;
  --color-iris-900: #221E4A;
  --color-iris-950: #15132E;

  /* status — semantic only */
  --color-jade-300: #7BE8BC;  --color-jade-400: #3ED2A0;  --color-jade-950: #062219;
  --color-amber-300:#FBD07A;  --color-amber-400:#F5A524;  --color-amber-950:#2B1B04;
  --color-rose-300: #FFA8AE;  --color-rose-400: #FB6E76;  --color-rose-950: #2B0E12;
  --color-sky-300:  #93D8FA;  --color-sky-400:  #4FB8ED;  --color-sky-950:  #061C29;

  /* semantic aliases — prefer these in templ */
  --color-canvas:      #08090C;
  --color-ground:      #0C0E12;
  --color-panel:       #101318;
  --color-raised:      #151920;
  --color-inset:       #1A1F27;
  --color-line:        #232833;
  --color-line-strong: #666E7D;
  --color-accent:      #9A90FF;

  --font-sans: "Archivo", ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --radius-ctl:   4px;
  --radius-panel: 10px;
}

@layer base {
  html { color-scheme: dark; }

  body {
    background: var(--color-ground);
    color: var(--color-ink-100);
    font-family: var(--font-sans);
    font-size: 13px;
    line-height: 20px;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }

  /* one focus ring, everywhere — WCAG 2.4.7 */
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 2px solid var(--color-iris-400);
    outline-offset: 2px;
    border-radius: var(--radius-ctl);
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      transition-duration: .01ms !important;
    }
  }

  * { scrollbar-width: thin; scrollbar-color: var(--color-ink-600) transparent; }
}
```

**Fonts must be self-hosted.** Do not add a `fonts.googleapis.com` link to
`layout.templ` — it puts a third-party request on every dashboard load and
breaks air-gapped installs. Put the Archivo and IBM Plex Mono variable woff2
files in `internal/web/static/fonts/`, declare them with `@font-face` and
`font-display: swap`, preload the two used first. They ship through the existing
`embed.go` static handler.

### Type ramp

| Role | Size / line-height | Weight | Tracking | Family |
|---|---|---|---|---|
| display | 30 / 34 | 600 | -0.020em | sans |
| title | 20 / 26 | 600 | -0.014em | sans |
| section | 14 / 20 | 600 | -0.005em | sans |
| body | 13 / 20 | 400 | 0 | sans |
| caption | 12 / 17 | 400 | 0 | sans |
| label | 10.5 / 14 | 500 | +0.090em, uppercase | mono |
| mono-sm | 12 / 18 | 450 | 0 | mono |
| mono-xs | 11.5 / 18 | 450 | 0 | mono |
| metric | 26 / 28 | 600 | -0.020em, tabular | sans |

### Geometry

- Spacing: 4px base — 4 8 12 16 20 24 32 40. Panel padding 16 compact / 20
  default. Section gap 24. Page gutter 24.
- Radii: **4px controls**, 10px panels. No pills.
- Control heights 28 / 32 / 36; touch target never below 44 on mobile.
- Table row 44. Sidebar 236. Topbar 48.
- Elevation is borders plus a four-step surface ramp. Shadow only on things that
  float: ⌘K, popovers, toasts, drawers.
- Motion: hover 120ms ease-out, panels 180ms. No bounce, no scale, no gradients.

---

## 2. Primitives — `internal/web/components/ui.templ`

```go
// NEW — replaces twelve hand-rolled button class strings.
// variant: primary | secondary | quiet | danger | icon
// size:    sm (28) | md (32) | lg (36)
templ Button(variant, size, label string)

// NEW — one label/control/help/error unit. Owns the aria-describedby
// wiring so no page has to remember it.
templ Field(f FieldSpec)
type FieldSpec struct {
    ID, Name, Label, Help, Error, Placeholder string
    Type         string // text|password|email|number|textarea|select
    Required     bool
    Options      []Option
    Autocomplete string
}

// NEW — replaces the four different back-link treatments.
templ BackLink(label, href string)

// NEW — destructive confirm that names the consequence.
templ ConfirmButton(c ConfirmSpec)
type ConfirmSpec struct { Trigger, Heading, Body, Confirm, Action string }

// CHANGED — square-cut outline tag. No pill, no dot, no tinted
// ground outside a banner.
templ Tag(label string)

// NEW — state marker: a 2px gutter rule plus the word.
// tone: running | ok | warn | dead | idle
templ State(tone, label string)

// CHANGED — takes an action so an empty state is never a dead end.
templ EmptyState(e EmptySpec)
type EmptySpec struct { Title, Body, ActionLabel, ActionHref string }

// UNCHANGED — PageHeader, Card, StatCard, Icon
```

### Button rules

- **4px radius, not 8.** Softly-rounded controls are the default of every
  generated dashboard; a tighter corner reads as an instrument.
- **Primary is achromatic** — `ink-50` fill, `ink-950` text, `inset 0 -1px 0
  rgba(0,0,0,.20)`. One per screen. Never coloured with iris; that is what keeps
  iris meaningful.
- **Secondary** is transparent with a 1px `line-strong` border. Hover moves the
  **border** to iris, not the fill.
- **Quiet is not a third box** — plain text, underline on hover at 3px offset.
  So a row of actions has exactly one boxed control.
- **Danger** is quiet-shaped (rose text, underline on hover). Only the confirm
  button inside a dialog gets a rose fill.
- **No spinner inside a button.** Working state = a 2px determinate hairline
  along the bottom edge plus a label change. The label must not resize.
- Retired: pill buttons, gradient fills, a coloured primary, icon+label+chevron
  in one control, `hover:bg-*-800` as the only hover signal.

### Tag and state rules

- **State** (`active`, `failed`, `running`, `backing off`, …) is a 2px × 11px
  gutter rule in the status hue plus the word in the `-300` step. No container.
- **Tag** (`oauth2`, `action`, `webhook`, `read-only`, counts) is mono 11px,
  1px `ink-600` border, 2px radius, no fill, no dot.
- Tinted grounds survive in exactly one place: **banners**, where the tint is
  the surface. Inside a table they turn every row into confetti.
- Every status carries a rule *and* a word. Colour is never the only channel.

---

## 3. Information architecture

Rail, two groups:

```
BUILD     Overview     /app
          Connectors   /app/connectors      (was /app/toolkits)
          Connections  /app/connections     (was /app/auth-configs)

OBSERVE   Logs         /app/logs
          Runs         /app/runs            (new — sync job queue)
          Events       /app/events          (was /app/triggers)
          Usage        /app/usage           (promoted out of Settings)

FOOTER    Certification /app/certification  (was /app/qa; operator-only)
          Docs · Settings
```

Settings absorbs Team (was top-level Users), Account (absorbs the top-level
Sessions page), Billing, Branding, Help.

### Vocabulary

| Drop | Use |
|---|---|
| Toolkit | Connector |
| Auth Config | Connection |
| Connected Account | Account |
| Trigger | Event |
| Operation | Tool |
| Sync job | Run |
| QA | Certification |

"Tool" wins over "operation" because it is the word the SDKs already use —
`appcall.tools({...})`.

Ship 301s from every old path for one release. Rename the URLs and the Go
symbols in the same PR; a half-rename is worse than either.

---

## 4. Durable execution — the missing screens

`internal/sync` is a durable job engine with no UI: leased work, exponential
backoff, terminal failure with a kept reason, cursors that survive restarts.
`cmd/worker` runs it; inbound webhooks schedule into it. Today a customer's sync
can die at attempt ten and the only way to find out is `psql`.

Engine facts the UI must reflect (from `internal/sync/engine.go`):

- Lease 60s. An expired lease requeues the job **without spending an attempt**.
- Backoff base 1s, doubling per attempt, capped at 1h, max 10 attempts.
- Advancing a page is **progress, not an attempt** — the job reschedules
  immediately and the attempt counter does not move.
- A failed page keeps the cursor, so a retry resumes rather than restarting.
- At 10 failures the job goes terminal `failed` and keeps `last_error`.

### `/app/runs`

Queue health strip (pending, running, backing off, dead, records 24h, worker
heartbeat) over a filterable table: state rule, run ID, operation, account,
attempt ladder (spent vs remaining), records, next wake / lease countdown.
Filters: state, connector, operation, account.

**Readable from `sync_jobs` + `sync_cursors` as they stand — no schema change.**

Operator actions write columns the engine already owns: Run now (`run_after =
now`), Reset attempts (`attempts = 0`), Cancel (`status`).

### `/app/runs/:id`

Attempt history timeline, cursor panel, backoff-policy panel, records written,
operator controls. Timeline entry kinds: `scheduled`, `claimed`, `page`,
`retry`, `lease_expired`, `succeeded`, `failed` — page entries must read as
progress, never as errors.

**Gated on a migration.** The row keeps only a current `attempts` count and the
latest `last_error`, so a timeline needs an append-only table:

```sql
CREATE TABLE sync_job_events (
    job_id text NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
    seq    integer NOT NULL,
    kind   text NOT NULL,
    at     timestamptz NOT NULL DEFAULT now(),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (job_id, seq)
);
```

plus a write on each transition in `ProcessJob`. Do not fake a timeline from
`attempts` alone. If this is not approved, ship the list and cut the detail page.

### Conventions borrowed, and not

Adopted because they map onto what the engine actually does: execution list
filterable by state, event-history timeline, retry-policy panel, worker/lease
display, terminated bucket, reset/retry/terminate controls, input/result
inspection (cursor + records).

Deliberately **not** adopted, because the engine has no such concept and the
affordance would lie: workflow/activity split, signals and queries, child
workflows, execution versioning and replay, namespaces, schedules/cron.

This stays observability plus three writes the engine already supports. It is
not a workflow builder and does not cross the line `AGENTS.md` draws against
becoming a generic automation product.

---

## 5. Accessibility

Measured against the shipped hex values. Current failures:

| Pair | Ratio | Needs |
|---|---|---|
| `dusk-blue-500` on `space-indigo-950` — all table headers, labels, metadata | 4.45 | 4.5 |
| `dusk-blue-500` on app background | 4.48 | 4.5 |
| `dusk-blue-600` on `prussian-blue-950` — every placeholder | 3.13 | 4.5 |
| `#fff` on `neon-ice-600` — Replay button | 2.05 | 4.5 |
| `space-indigo-700` on panel — input borders | 1.83 | 3.0 |

New palette, same roles: 7.14 / 7.41 / 18.55 / 6.92 / 3.50 — all pass.
`ink-400` (4.42) is defined as a **non-text token** for exactly this reason.

Eight fixes, each under two hours:

1. `dusk-blue-500` → `-400`, `-600` → `-400` for placeholders (`components/*.templ`)
2. Replay button to the standard primary treatment (`logs.templ`)
3. Skip link as the first child of `body` (`layout.templ`)
4. One `:focus-visible` rule in the base layer (`styles/app.css`)
5. `aria-live="polite"` on `#tk-test-result` and `#trigger-rows`; `role="alert"`
   on the error fragment
6. `aria-label` on sign-out, refresh, copy, close
7. `aria-current="page"` on the active nav link
8. `scope="col"` on every `th`; visually-hidden `caption` per table

Also: `h-screen overflow-hidden` on `body` clips the sidebar at 200% zoom — let
the shell scroll and give only the main region overflow. The `x-dynamic-options`
typeahead is `div`s with `data-on:click` and is unreachable by keyboard; rebuild
it as a listbox with arrow keys, Enter, Escape and `aria-activedescendant`.

---

## 6. Microcopy

Voice: a competent colleague who already looked. Say what happened, who did it,
and what to do next. Never apologise, never blame the user, never "please try
again" without saying what would be different. Identifiers in mono. No
exclamation marks, no emoji.

Buttons name the result, never the mechanism:

| Never | Always |
|---|---|
| Submit | Run tool |
| Save credentials | Connect Apify |
| Connect Gmail (OAuth start) | Continue to Gmail |
| Test | Check connection |
| Replay action | Run this again |
| Send request | Request this connector |
| Save changes | Rename organisation |
| Load more | Load 50 more |

Errors name the actor, the cause and the next step. Replace every instance of
`Connection setup failed. Check your credentials and try again.` — one sentence
currently covers every auth failure for every connector, which is the
lowest-scoring finding in the audit. The full rewritten set (10 errors, 6 empty
states, 7 confirmations, 8 tooltips) is on the canvas **Audit & copy** page.

Destructive actions confirm with consequences, not "Are you sure?" — name the
thing, state what breaks, quantify it where possible, and label the confirm
button with the action.

---

## 7. Work order — one PR per row

| PR | Scope | Done when |
|---|---|---|
| 1 | Tokens, fonts, base layer | Old ramps deleted, not aliased. Pages will look wrong until PR 3; that is expected. |
| 2 | Primitives | Button, Field, Tag, State, EmptyState, BackLink, ConfirmButton render every state on the component sheet. Golden tests on class output. |
| 3 | Shell — rail, topbar, ⌘K | Two nav groups, `aria-current` + iris rail on active, skip link first focusable, shell scrolls at 200%. |
| 4 | Connector detail — two-pane run console | Tabs; tool list grouped by resource with read-only marks; run panel and result side by side; Connect is the header action when no account exists; a safe read is pre-selected on first visit. |
| 5 | Copy pass | Every string replaced. No "Please try again" survives in the tree. |
| 6 | Logs — filters + trace drawer | Connector, tool, error code, connection and time range all reach `ListLogsRequest`. Row click opens the drawer without navigating; `/app/logs/:requestID` still renders standalone. |
| 7 | Connections — status truth | Account identity replaces raw IDs. `authorizing` and `degraded` render with cause, elapsed time and a matching recovery button. Disconnect confirms. |
| 8 | Overview | Four KPI tiles, two charts, "Needs attention". Empty project shows the activation state. `GettingStarted` deleted, not hidden. |
| 9 | Catalog + a11y sweep | Search covers tool titles. Eight a11y fixes in. `scope` and captions on every table. |
| 10 | Rename + 301s | Old paths redirect. Go symbols renamed in the same PR. |
| 11 | Runs — durable execution console | Queue health + filterable list from `sync_jobs`. Dead runs surface in Overview. Run now / Reset / Cancel wired. |
| 12 | Run detail — attempt history | Gated on the `sync_job_events` migration. |
| 13 | Events, Usage, Settings, Certification | Reskinned against the primitives. No page-local button or input markup left. |

### Acceptance criteria, every PR

- Renders at 375 / 768 / 1024 / 1440 with no horizontal page scroll.
- Every interactive element keyboard-reachable with a visible focus ring.
- Every async action has loading, disabled, success and error states.
- Every Datastar swap target carrying a result or error has a live region.
- No hand-rolled button, input, tag or badge markup. Primitives only.
- Long names, emails, request IDs and JSON wrap or scroll inside their container.
- Contrast verified, not assumed: text ≥ 4.5:1, control boundaries ≥ 3:1.
- Tests written first for behaviour changes; `templ generate` output committed;
  `gofmt` clean.

---

## 8. `CONTRACT.md` amendments

`internal/web/CONTRACT.md` must change with PR 1 or it will contradict the code.

- **Palette section** — replace wholesale. Every class in it names a colour that
  no longer exists.
- "Do not use negative letter spacing" → "Negative letter-spacing is permitted
  at 18px and above only."
- "`text-xs` only for labels" → reference the named type roles (label / caption /
  body / section / title), not Tailwind sizes.
- New: "Do not hand-roll a button, input or tag. If a primitive is missing, add
  it to `ui.templ` in its own PR."
- New: "Every Datastar swap target that carries a result or an error declares a
  live region."
- New: "`ink-400` is a non-text token. Text uses `ink-300` or lighter."

---

## 9. Open decisions — do not guess these

1. **Read-only tool marking.** The manifest cannot say a tool is safe. Adding
   `x-read-only` and `x-safe-default` to `Operation` is a connector-contract
   change and gates the pre-selection in PR 4.
2. **Account identity.** Showing `arvee@manavritti.com` instead of `conn_01JQ…`
   means connectors return an identity from healthcheck and connections store
   it. Schema plus runner work.
3. **Latency / p95.** The Overview latency tile assumes a duration column on
   `ActionLog`. If there is none, cut the tile — do not fake it.
4. **Attempt history storage.** Approve `sync_job_events` or cut PR 12 and ship
   the run list only.
5. **The rename.** Worth doing, and the one item that churns routes and tests.
   If it is not happening, say so now — the copy, the nav and the docs all
   assume it.
