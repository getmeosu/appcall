# Plan: Guided nested-array controls for Google Sheets

## Goal

Allow the guided connector form to submit schema-declared arrays of rows as
structured JSON while preserving the existing comma-separated controls for
simple arrays. A user entering rows such as
`[["A, B",42,true,""],["C",false,0]]` must produce the same typed JSON
value, and malformed row structure must fail as invalid action input before a
provider request is dispatched.

## Architecture

The trusted schema remains the source of truth. `crates/appcall-web/src/forms.rs`
will detect `type: array` with `items.type: array` in both assembly and
rendering. Assembly will parse the field as bounded JSON and require an outer
array whose elements are arrays; it will retain parsed cell values unchanged.
Rendering will use the existing `ui::Field` textarea path with the field's
normal `f.<path>` name, a label identifying JSON rows, and help text describing
the preserved cell values. Existing scalar and email-object array handling,
boolean selects, decimal steps, raw override precedence, depth limits, and
input-size limits remain in place.

The checked-in Google Workspace manifest is the fixture authority for the
focused Rust tests. The existing dashboard JavaScript harness supplies the
browser regression: a populated `f.values` textarea remains enabled for a
normal guided submission and becomes disabled only after the separate raw JSON
override is populated.

## Tech Stack

- Rust, `serde_json`, and the existing `appcall-web` form/UI helpers
- Bun's Node-compatible `node:test` harness for `static/dashboard.js`
- Checked-in JSON manifest fixture at
  `runner/connectors/google-workspace/manifest.json`
- Cargo workspace and Makefile verification targets

## Implementation steps

### 1. Add failing reproducer tests (RED)

- Modify `crates/appcall-web/tests/forms.rs`.
- Load `sheets.values.append` and `sheets.values.update` input schemas directly
  from the checked-in manifest.
- Add assembly assertions for commas in strings, numbers, booleans, empty
  cells, empty rows, and both Sheets operations.
- Add invalid-input assertions for malformed JSON and a non-array row.
- Add a render assertion that the actual Sheets `values` field is a textarea
  with a JSON-row label/help marker.
- Modify `crates/appcall-web/tests/toolkit.test.js` with the browser submission
  regression for a populated `f.values` control and raw override precedence.
- Run the focused tests and capture the expected RED failures before changing
  production code.

### 2. Implement the smallest schema-directed fix (GREEN)

- Modify `crates/appcall-web/src/forms.rs` only.
- Add a small nested-array shape predicate shared by rendering and assembly.
- Parse structured array input as JSON, enforce row-array structure, and return
  `Error::Invalid` on syntax or shape failure.
- Render structured arrays as the identified JSON textarea while retaining the
  existing control selection and sample behavior for all other field types.
- Run the focused Rust and Bun tests until they pass.

### 3. Refactor and review the focused change

- Format touched Rust and verify the diff contains only the design/plan docs,
  the form implementation, and the focused tests.
- Check that the existing simple-array, boolean, and decimal tests still pass.
- Review user-input bounds and typed error mapping; do not add new logging,
  provider calls, schema changes, or authentication behavior.

### 4. Run repository gates and prepare handoff

- Run `cargo fmt --all -- --check` and the focused Rust test target.
- Run `bun test crates/appcall-web/tests/*.test.js`.
- Run relevant `cargo test --locked` package/workspace checks and
  `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings`
  where the local environment supports them.
- Run race/concurrency checks applicable to the changed packages and record any
  environment-limited gates explicitly.
- Commit with a conventional fix message, push the unique branch, and open a
  PR against `main` with exact RED/GREEN and validation evidence. Leave the PR
  unmerged and the issue open.
