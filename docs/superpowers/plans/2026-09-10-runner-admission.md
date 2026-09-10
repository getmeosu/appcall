# Runner Admission Correlation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correlate Bun's early HTTP 503 `RUNNER_BUSY` admission rejections with the Rust request that was not dispatched, while preserving conservative unknown outcomes for uncorrelated responses and existing action cleanup/retry behavior.

**Architecture:** The Rust runner client will send its validated request ID in the existing dedicated `x-request-id` header. Bun will inspect only that bounded, safe header before reading the body and echo it only on its early admission rejection envelope. The Rust client will classify exactly a matching-ID HTTP 503 `RUNNER_BUSY` envelope as a typed `RunnerFailure` source with `NotDispatched`; all malformed, missing-ID, mismatched-ID, or wrong-status responses remain `MalformedResponse`/`Unknown`. The action adapter will preserve `RUNNER_BUSY` and mark it transient; the existing service path will be covered for bounded retries and release of the not-dispatched reservation/idempotency claim.

**Tech Stack:** Bun native tests, Rust `reqwest` runner client, Tokio integration tests, `appcall-actions` adapter/service tests.

---

### Task 1: Add the complete RED test set

**Files:**
- Modify: `runner/bun/test/durable_boundary.test.ts`
- Modify: `crates/appcall-runner-client/tests/boundary.rs`
- Modify: `crates/appcall-actions/tests/runner_adapter.rs`
- Modify: `crates/appcall-actions/tests/execution.rs` or `crates/appcall-actions/tests/execution/evidence.rs`

- [ ] **Step 1: Write failing tests**

Add focused `createFetchHandler` tests that hold one accepted request and assert the actual saturation rejection is HTTP 503 with `{ id, ok: false, error.code: "RUNNER_BUSY" }`; add a draining test after `maxJobs` is consumed with the same envelope; add a safe-correlation case proving an invalid or absent header does not echo the unread body ID. Add Rust client tests for the request header, matching HTTP 503 `RUNNER_BUSY` -> `ErrorKind::Runner`/`NotDispatched`, and malformed/missing/mismatched-ID plus wrong-status busy responses -> `ErrorKind::MalformedResponse`/`Unknown`. Add adapter/service tests for transient `RUNNER_BUSY`, conservative malformed mapping, bounded read-only retries, and release of the known not-dispatched reservation/idempotency claim.

- [ ] **Step 2: Run the Bun tests to verify RED**

Run:

```bash
bun test runner/bun/test/durable_boundary.test.ts runner/bun/test/serve.test.ts
```

Expected: the new admission-envelope assertions fail because `serve.ts` currently returns an ID-less `RUNNER_BUSY` response; the client and adapter/service assertions fail for the known current classification/transient-set bugs. Failures must be caused by the intended behavior, not test setup.

- [ ] **Step 3: Commit the RED checkpoint**

```bash
git add runner/bun/test/durable_boundary.test.ts crates/appcall-runner-client/tests/boundary.rs crates/appcall-actions/tests/runner_adapter.rs crates/appcall-actions/tests/execution.rs crates/appcall-actions/tests/execution/evidence.rs
git commit -m "test: reproduce uncorrelated runner admission rejection"
```

### Task 2: Correlate and classify the runner protocol

**Files:**
- Modify: `crates/appcall-runner-client/src/lib.rs` after RED validation
- Modify: `runner/bun/src/serve.ts`
- Test harness: use the real Bun `createFetchHandler` envelope in Bun tests; if the local test setup permits a process harness, run the Rust client against a Bun child process for saturation and draining as an additional integration check.

The protocol tests are written in Task 1 and the complete RED gate is run there. Do not edit these production files until the complete RED checkpoint has been captured.

- [ ] **Step 1: Implement the minimal protocol fix**

Send `x-request-id` from `RunnerClient::exchange` for the already bounded request ID. In `createFetchHandler`, validate that header as a non-empty, <=256-byte safe ASCII correlation ID and include it in the early rejection JSON only when valid. In `RunnerClient::exchange`, require both status 503 and code `RUNNER_BUSY` for the `NotDispatched` classification; otherwise retain the current malformed/unknown guard for uncorrelated admission responses. Keep body/response limits, timeout, redirect, auth, and redaction logic unchanged.

- [ ] **Step 2: Run the same focused tests to verify GREEN**

Run the Bun and Rust commands above and confirm all focused tests pass.

### Task 3: Preserve adapter and action-service semantics

**Files:**
- Modify: `crates/appcall-actions/src/adapters.rs` after RED validation
- Modify: `crates/appcall-actions/tests/runner_adapter.rs` (tests added in Task 1)
- Modify: `crates/appcall-actions/tests/execution.rs` or `crates/appcall-actions/tests/execution/evidence.rs` (tests added in Task 1)

- [ ] **Step 1: Implement the minimal adapter change**

Add only `RUNNER_BUSY` to the adapter's transient code set; retain `safe_runner_code` and the service's existing bounded retry and `release_not_dispatched_with_reservation` logic.

- [ ] **Step 2: Run the same focused action tests to verify GREEN**

Run the command above and confirm the new and existing tests pass.

- [ ] **Step 3: Commit the single GREEN fix checkpoint**

```bash
git add runner/bun/src/serve.ts crates/appcall-runner-client/src/lib.rs crates/appcall-actions/src/adapters.rs
git commit -m "fix: correlate and retry runner busy admissions"
```

### Task 4: Format and final verification

**Files:**
- Only the issue #69 files above plus this plan document.

- [ ] **Step 1: Format changed Rust and TypeScript**

Run the repository's available Rust formatter and the existing Bun formatter/lint entry point if present; do not reformat unrelated files.

- [ ] **Step 2: Run relevant package and integration tests**

Run the focused Bun and Cargo commands, then the relevant workspace package tests and formatting check. Record unavailable or environment-gated checks explicitly.

- [ ] **Step 3: Inspect final scope**

Verify `git diff --check`, `git status --short`, changed-file list, checkpoint ancestry, and that no merge, push, PR, issue closure, worktree deletion, or unrelated issue files were touched.
