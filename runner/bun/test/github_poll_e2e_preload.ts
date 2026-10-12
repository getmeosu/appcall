// Test-only bun preload for crates/appcall-api/tests/github_poll_e2e.rs. The GitHub connector
// hard-codes https://api.github.com; this rewrites only that origin to the local mock named by
// APPCALL_E2E_GITHUB_MOCK before the runner's modules load, so the runner's real GitHub client,
// allowlist check, normalizers and sync code all run unchanged. Never loaded in production.
const target = process.env.APPCALL_E2E_GITHUB_MOCK;
if (!target) throw new Error("APPCALL_E2E_GITHUB_MOCK is required by the e2e preload");
const mock = new URL(target);
const native = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "api.github.com") return native(input, init);
  url.protocol = mock.protocol;
  url.host = mock.host;
  return native(url.toString(), input instanceof Request ? { method: input.method, headers: input.headers, ...init } : init);
}) as typeof fetch;
