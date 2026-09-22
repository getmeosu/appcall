# Console review: implementation handoff

Static HTML export of the "AppCall Console Review" design canvas (13 Sep 2026).
Read this file first, then open `index.html` in a browser.

- `index.html` lists every screen with its design notes and a link to today's screen.
- `screens/*.html` are the mockups, one per screen, at native frame width.
  Add `?clean` to the URL to hide the numbered review markers.
- `assets/signal.css` holds the tokens and mockup components.
  `assets/review-markers.css` holds the numbered markers only; they are not product UI.
- `today/*.jpg` are screenshots of the current dashboard for comparison.
- Fonts load from `crates/appcall-web/static/fonts/`, so open the files from inside this repo.

This export extends `docs/design/console-redesign.md` (the Signal spec). Tokens, type
ramp, radii and primitive rules there are unchanged. Where the two disagree on
information architecture, navigation labels or screen layout, this export is newer.

## Ground rules for the implementation

These come from the repository and are not negotiable in the mockups either.

- Rust SSR stays the source of truth (`crates/appcall-web/CONTRACT.md`).
  No client framework, no new runtime. Datastar may only swap server-rendered targets.
- Use the `ui.rs` primitives. If a primitive is missing, add it to `ui.rs` in its own PR.
- Status is always a rule plus a word (`ui::state`). Never a pill, never colour alone.
- Fonts stay self-hosted. Do not add the Google Fonts link the canvas used for preview.
- Every page must work at 375, 768, 1024 and 1440 with no page-level horizontal scroll.
- Follow `AGENTS.md`: test-first for behaviour changes, risk tier per PR, one PR per row below.
- All names, emails, counts and IDs in the mockups are sample data.
  Values in `[brackets]` are placeholders, including `[YOUR_APPCALL_ORIGIN]`, `[owner]/[repo]`,
  and the `ak_live_…` key format.

## Mockup class → production primitive

| Mockup class | Production |
|---|---|
| `.btn.primary` / `.secondary` / `.quiet` / `.danger` / `.icon` | `ui::Button` with `ButtonVariant::{Primary, Secondary, Quiet, Danger, Icon}` |
| `.btn.sm` | `ButtonSize::Sm` |
| `.field` + `.control` | `ui::Field` (`ui-field`, `ui-control`) |
| `.control.select` | `ui::Field` with `Control::Select` |
| `.tag` | `ui::tag` |
| `.state.running` / `.ok` / `.warn` / `.dead` / `.idle` | `ui::state(Tone::{Running, Ok, Warn, Dead, Idle}, word)` |
| `.empty` | `ui::EmptyState` |
| `.kpi` | existing `overview-kpi` markup in `overview.rs` |
| `.panel`, `.page-head`, `.section-title`, `.label`, `.caption` | existing panel and type-role CSS; unify the page-local copies |

New primitives the mockups need. Add each to `ui.rs` before using it on a page.

| Mockup class | Proposed primitive | Notes |
|---|---|---|
| `.seg` | `ui::Segmented` | A radio-group filter rendered as links or radios. One `aria-current` / `checked` item. Carries counts. |
| `.tbl-wrap` + `table.tbl` | `ui::Table` | One table primitive to replace `remaining-table`, `logs-table`, the runs table and `connections-table`. 44px rows, mono uppercase headers, `scope="col"`, caption. |
| `.mono-mark` | `ui::ProviderMark` | 28px, 4px radius. Initials until manifests ship a logo asset. |
| `.disclosure` | native `<details>` styled once | Used for Schema, Advanced and More filters. |
| `.banner` | `ui::Banner` | The only tinted surface. Tones warn and rose. |
| `.page-head` | `ui::PageHeader` | Title, one purpose line, at most one primary action. Replaces the per-page header CSS. |

## Information architecture change

The dashboard must present two surfaces as one product:

- **Apps**: connectors, connections, tool calls, syncs, webhook events.
- **Workflows**: the durable engine's workflows and runs.

Rail groups in `crates/appcall-web/src/shell.rs` (`NAV`):

```
Overview
APPS        Connectors · Connections · Calls · Syncs · Events
WORKFLOWS   Workflows · Runs
footer      Usage · Docs · Settings
```

Renames, with one-release 301s added in `crates/appcall-web/src/routes.rs`:

| Today | Proposed | Why |
|---|---|---|
| Logs `/app/logs` | Calls `/app/calls` | It lists tool calls. |
| Runs `/app/runs` (sync queue) | Syncs `/app/syncs` | Frees "Runs" for workflow runs. |

External `/v1` routes, SDK fields and storage names do not change.

## Screens

Each row is one PR-sized unit. "Blocked" means the screen cannot be real until the dependency lands.

| # | Screen | File(s) to change | Blocked on |
|---|---|---|---|
| 0 | Primitives from the table above | `ui.rs`, `ui/sheet.rs`, `styles/app.css` | nothing |
| 1 | Shell: SVG icons, rail groups, project row, breadcrumb path, ⌘K input that also finds connectors and runs | `shell.rs`, `static/dashboard.css`, `static/palette.js` | 0 |
| 2 | First run (`03-first-run`) | `overview.rs` `activation()` | API key route (decision 1) for the key panel; ship steps without it |
| 3 | Overview (`02-overview`) | `overview.rs`, overview CSS in `static/dashboard.css` | Workflows half needs decision 2 |
| 4 | Start here (`01-start-here`) | new page in `pages.rs`, linked from First run and Docs | nothing |
| 5 | Connectors (`04-apps-connectors`) | catalog renderer in `pages.rs` | nothing |
| 6 | Connector console (`05-apps-connector-console`) | `connector.rs`, connector CSS in `static/dashboard.css` | account identity (decision 3) for "Run as" labels |
| 7 | Connections (`06-apps-connections`) | `connections.rs`, `#connections-page` CSS in `styles/app.css` | decision 3 for identity column |
| 8 | Calls (`07-apps-calls`) | `logs.rs`, `static/logs.js`, `routes.rs` | "Took" column needs decision 4 |
| 9 | Syncs (`08-apps-syncs`) | `runs()` in `pages.rs`, `run_detail.rs`, `routes.rs` | nothing |
| 10 | Workflows list (`09-workflows-list`) | new page | decision 2 |
| 11 | Workflow run detail (`10-workflows-run-detail`) | new page | decision 2 |
| 12 | Settings › API keys (`11-settings-api-keys`) | `settings()` in `admin_ui.rs`, new sub-nav | decision 1 |

Mobile frames (`12`, `13`) are acceptance references for rows 3 and 6 at 390px, not separate PRs.

### Defects to fix regardless of the redesign

1. First run primary button looks disabled. `.overview-activation a` sets iris text on the
   ink-50 primary fill. Scope the link colour to the step links only.
2. "Run health unavailable." renders as a bare line under the activation panel. Render it
   inside the panel or omit it when the project has no runs.
3. The empty `.catalog-request-result` box on Connectors renders as a visible bordered
   rectangle. Add `:empty { display: none }`.
4. Settings says "API keys for this project are managed via the API". No route mints a key.
   Remove the sentence until decision 1 lands.
5. Settings flashes read the same for success and failure (for example `?invited=1` and
   `?error=invite`). Give each outcome its own sentence.
6. Mixed spelling: "Rename organisation" next to "Organization". Use "Organization".

## Open decisions

1. **API key lifecycle.** There is no `/v1` route, CLI command or page that creates, lists,
   rotates or revokes a key. First run and Settings › API keys depend on it. Key prefix and
   display format are also undecided.
2. **Engine in the console.** `appcall-engine` has its own transport in `appcall-engine-http`
   (`POST /runs`, `GET /runs/{id}`, `/result`, `/history`, `/reconciliation`,
   `POST /runs/{id}/signals`, `/cancel`, `/resume`, `/reconcile`), but nothing in
   `appcall-api` or `appcall-web` reads it. Workflows screens need a project-scoped read path
   and the same auth, tenancy and operator-grant rules as Syncs. There is no "list registered
   workflows" call today. Nothing here is a workflow builder; `AGENTS.md` forbids that.
3. **Account identity.** Showing an email or workspace instead of `conn_…` needs the
   healthcheck to return an identity and connections to store it. Until then, show the auth
   hint (for example "API key · ends in 9f2a") and keep the ID secondary.
4. **Call duration.** The "Took" column assumes a duration on the action log. Cut the column if
   none is recorded; do not derive it.
5. **Start here vs First run placement.** Proposed: `/app` shows First run while the project has
   no connection and no calls, and Start here lives at its own route linked from First run and
   Docs. Confirm before building row 4.

## Acceptance for every PR

- Renders at 375, 768, 1024 and 1440 with no horizontal page scroll.
- Every interactive element is keyboard reachable with the iris focus ring.
- Every async action has loading, disabled, success and error states.
- Every Datastar result or error target declares a live region.
- No hand-rolled button, input, tag, state or table markup. Primitives only.
- Long names, emails, request IDs and JSON wrap or scroll inside their container.
- Text contrast at least 4.5:1, control boundaries at least 3:1.
- Unknown values render as an explicit "not recorded" or "—", never a guess.
