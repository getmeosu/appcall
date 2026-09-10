# Guided nested-array controls

## Problem

Guided action forms currently turn every array field into a comma-separated
control. That representation cannot express the arrays of rows required by
the Google Sheets append and update operations: commas inside cells are
ambiguous, and nested arrays become strings. The raw JSON override works, but
the guided form does not provide a discoverable way to enter the declared
shape.

## Design

When a trusted input schema declares an array whose `items.type` is `array`,
render that field as a clearly labeled JSON textarea. The field keeps its
normal `f.<path>` name, so the existing form submission and guided assembler
path carry it to the action request. The label identifies the representation as
JSON rows, and the help text explains that JSON preserves commas, scalar cell
types, and empty strings.

The assembler uses the schema to select this path. An empty field remains
omitted, preserving optional-field behavior. A nonempty value must parse as a
JSON array, and every outer element must itself be a JSON array. Parsed values
are returned unchanged, which preserves strings containing commas, numbers,
booleans, empty cells, and empty rows. Malformed JSON or a non-array row returns
the existing typed invalid-input error before dispatch; the dashboard maps
that error to its existing actionable invalid-action-input recovery state.

Arrays whose item schema is scalar or the existing email object shape keep the
comma-separated behavior. Boolean controls and decimal number controls are
unchanged. The existing raw JSON override remains available and continues to
take precedence over guided controls.

## Validation

- Add focused assembler tests using the checked-in Google Workspace manifest
  schemas for both `sheets.values.append` and `sheets.values.update`.
- Cover commas in cell strings, numbers, booleans, empty cells, empty rows,
  malformed JSON, and non-array rows.
- Add a render test using the same manifest schemas to assert a JSON textarea
  with an identifying label and help text.
- Add a browser-side submission regression in the existing dashboard JavaScript
  harness to prove a populated `f.values` guided control remains eligible for
  the normal submission and is disabled only when the raw override is used.
- Run the focused Rust and Bun tests first, then formatting, package/workspace
  checks, and the relevant security and race gates.

## Scope

Only the guided form renderer/assembler and its focused tests change. The
Google Sheets manifest, connector execution code, authentication, and raw JSON
transport do not change.
