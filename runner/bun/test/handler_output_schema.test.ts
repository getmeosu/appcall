// PLAT-OUT-2: every connector operation, dispatched through the real
// createFetchHandler with canned and pinned-fixture provider responses, must
// return only what its closed outputSchema declares. The sweep itself lives in
// output_schema_sweep.ts and runs in a child process so its stubbed fetch is in
// place before any connector module loads; see that file for how the handler's
// own output is separated from the keys the server and compile.ts add.
import { describe, expect, test } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const connectorsDir = resolve(import.meta.dir, "../../connectors");
const allConnectors = readdirSync(connectorsDir)
  .filter((name) => existsSync(resolve(connectorsDir, name, "manifest.json")))
  .sort();

// Connectors whose handwritten ops PLAT-OUT-2 fixed: every op must be reached.
const FIXED = [
  "anchor-browser", "apollo", "avoma", "bigmailer", "bug-herd", "greenhouse",
  "heyzine", "laposta", "lever", "quickbooks", "raisely", "reply-io", "statuscake",
];

// Known output/schema mismatches that a handler change cannot fix. Each entry
// must still reproduce, so a fix forces its removal here.
// (lever update_stage/archive were here until their manifests declared the
// {opportunity} that EffectPolicy Reconcile answers with.)
const ALLOWED_FINDINGS: Record<string, string> = {};

// Ops in FIXED connectors the sweep cannot build a fixture for, with a reason.
const UNREACHABLE_SYNC =
  "The handler reads a pre-fetched `response` input that the closed manifest inputSchema ({realmId, query}) does not declare, so no schema-valid request can reach it through the server.";
const ALLOWED_UNREACHED: Record<string, string> = {
  "quickbooks sync invoices.list": UNREACHABLE_SYNC,
  "quickbooks sync customers.list": UNREACHABLE_SYNC,
  "quickbooks sync payments.list": UNREACHABLE_SYNC,
};

type Report = {
  reached: number;
  closedChecked: number;
  platformEnveloped: number;
  healthcheckContract: string[];
  healthcheckNoCredential: string[];
  findings: Array<{ connector: string; kind: string; op: string; extra: string[]; missing: string[] }>;
  invalid: Array<{ connector: string; kind: string; op: string; error: string }>;
  skipped: Array<{ connector: string; kind: string; op: string; reason: string }>;
};

async function sweep(connectors: string[]): Promise<Report> {
  const child = Bun.spawn(["bun", "run", resolve(import.meta.dir, "output_schema_sweep.ts"), ...connectors], {
    cwd: resolve(import.meta.dir, ".."),
    // Any fetch the stub does not catch fails instead of reaching the network.
    env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", http_proxy: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9", NO_PROXY: "", no_proxy: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const line = stdout.split("\n").reverse().find((entry) => entry.startsWith("OUTPUT_SCHEMA_SWEEP_REPORT "));
  if (code !== 0 || !line) throw new Error(`output schema sweep failed (exit ${code}): ${stderr.slice(-2000)}`);
  return JSON.parse(line.slice("OUTPUT_SCHEMA_SWEEP_REPORT ".length)) as Report;
}

describe("handler output matches its closed outputSchema", () => {
  test("every reachable op across all connectors returns only declared keys", async () => {
    const report = await sweep(allConnectors);
    const findings = report.findings.map((f) => `${f.connector} ${f.kind} ${f.op}`);
    const unexpected = report.findings
      .map((f) => `${f.connector} ${f.kind} ${f.op}`)
      .filter((key) => !(key in ALLOWED_FINDINGS));
    expect(unexpected).toEqual([]);
    expect(Object.keys(ALLOWED_FINDINGS).filter((key) => !findings.includes(key))).toEqual([]);
    expect(report.invalid).toEqual([]);

    const unreached = report.skipped
      .filter((s) => FIXED.includes(s.connector))
      .map((s) => `${s.connector} ${s.kind} ${s.op}`)
      .filter((key) => !(key in ALLOWED_UNREACHED));
    expect(unreached).toEqual([]);
    const reachedNow = new Set(report.skipped.map((s) => `${s.connector} ${s.kind} ${s.op}`));
    expect(Object.keys(ALLOWED_UNREACHED).filter((key) => !reachedNow.has(key))).toEqual([]);
    // quickbooks' static healthcheck is refused with credentials (no provider
    // evidence), so its shape is checked on the credential-free path.
    expect(report.healthcheckNoCredential).toContain("quickbooks");

    // The sweep must keep reaching the bulk of the catalogue, or a passing run
    // would prove little.
    expect(report.closedChecked).toBeGreaterThan(10_000);
    expect(report.reached / (report.reached + report.skipped.length)).toBeGreaterThan(0.9);
  }, 600_000);
});
