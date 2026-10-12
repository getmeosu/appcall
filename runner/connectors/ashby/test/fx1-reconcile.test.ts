import { describe, expect, test } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { executeJobsGetSync } from "../src/sync";
import { executeJobsSetStatus, executeJobsUpdate } from "../src/g2";
import { executeCandidatesAddTag } from "../src/g1";
import { assertOutputSchema } from "../../../bun/src/declarative/validate";
import { splitOperationMetadata } from "../../../bun/src/operation-metadata";
import contract from "../../../../crates/appcall-connectors/tests/connector_contract.json";
import manifest from "../manifest.json";
import jobUpdated from "../fixtures/job_updated.json";
import jobStatusSet from "../fixtures/job_status_set.json";
import candidateTagAdded from "../fixtures/candidate_tag_added.json";

// FX-ashby-1: the Reconcile observe gets the action input unchanged
// (jobs.get / candidates.get have no closed inputSchema), so the observe
// must accept the action's own key, or the op must not declare Reconcile.

const auth = { apiKey: "fixturekey" };
const JOB = (jobUpdated as { results: { id: string } }).results.id;

type Call = { method: string; path: string; body: Record<string, unknown> | null };

function stub(bodies: unknown[]) {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const raw = typeof init?.body === "string" ? init.body : null;
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body: raw ? JSON.parse(raw) : null });
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

async function run(action: string, input: Record<string, unknown>) {
  const result = defaultConnectorRegistry.executeAction("ashby", action, input);
  expect(result.ok).toBe(true);
  return await (result as { ok: true; output: unknown }).output;
}

type Op = { effectPolicy?: string; reconcile?: string; effect?: unknown };
const ops = manifest.operations as unknown as Record<string, Op>;

describe("FX-ashby-1 jobs.get observe accepts the jobs.update input", () => {
  test("observe input built from jobs.update input does not throw and reads /job.info with the jobId", async () => {
    const opInput = { jobId: JOB, title: "Principal Engineer", teamId: "dept-1" };
    const { calls, impl } = stub([jobUpdated]);
    const out = await executeJobsGetSync({ ...auth, ...opInput, fetch: impl });
    expect(calls).toEqual([{ method: "POST", path: "/job.info", body: { id: JOB } }]);
    expect(out.job).not.toBeNull();
  });

  test("id wins over jobId when both are present", async () => {
    const { calls, impl } = stub([jobUpdated]);
    await executeJobsGetSync({ ...auth, id: JOB, jobId: "other-job", fetch: impl });
    expect(calls[0]!.body).toEqual({ id: JOB });
  });

  test("still requires an id when neither key is given", async () => {
    const { impl } = stub([jobUpdated]);
    await expect(executeJobsGetSync({ ...auth, fetch: impl } as never)).rejects.toThrow("id is required");
  });
});

describe("FX-ashby-1 through the registry (effect policy)", () => {
  test("jobs.update reconciles via jobs.get on the same jobId", async () => {
    const { calls, impl } = stub([jobUpdated, jobUpdated]);
    await run("jobs.update", { ...auth, jobId: JOB, title: "Principal Engineer", fetch: impl });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /job.update", "POST /job.info"]);
    expect(calls[1]!.body).toEqual({ id: JOB });
  });

  test("jobs.set_status makes exactly one call (no observe)", async () => {
    const { calls, impl } = stub([jobStatusSet]);
    await run("jobs.set_status", { ...auth, jobId: JOB, status: "Closed", closeReasonId: "cr-1", fetch: impl });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /job.setStatus"]);
  });

  test("candidates.add_tag makes exactly one call (no observe)", async () => {
    const { calls, impl } = stub([candidateTagAdded]);
    await run("candidates.add_tag", { ...auth, candidateId: "cand-1", tagId: "tag-1", fetch: impl });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /candidate.addTag"]);
  });
});

describe("FX-ashby-1 manifest effect keys", () => {
  test("jobs.update keeps Reconcile → jobs.get", () => {
    expect(ops["jobs.update"]!.effectPolicy).toBe("Reconcile");
    expect(ops["jobs.update"]!.reconcile).toBe("jobs.get");
  });

  test("jobs.set_status and candidates.add_tag omit effectPolicy, reconcile and effect", () => {
    for (const key of ["jobs.set_status", "candidates.add_tag"]) {
      expect(ops[key]!.effectPolicy).toBeUndefined();
      expect(ops[key]!.reconcile).toBeUndefined();
      expect(ops[key]!.effect).toBeUndefined();
    }
  });
});

// Rule (linus, FX-ashby-1): the registry returns the observe's raw output with
// no projection, so a kept Reconcile is valid only if that output conforms to
// the mutating op's OWN declared output schema. All three ops declare
// { job: Job } / { candidate: Candidate } with the inner object AND the top
// level closed. FX-ashby-2: PLAT-OUT-1 moved { connector, action } to the RPC
// result envelope, so the output Rust validate_output checks is bare.
// The manifest and the contract oracle must agree, and every dispatched output
// (including jobs.update's raw jobs.get observe output) must validate.
describe("FX-ashby-1 registry output conforms to each op's declared output schema", () => {
  const ashbyContract = (contract as Array<{ key: string; operations: Array<{ key: string; outputSchema: unknown }> }>)
    .find((c) => c.key === "ashby")!;
  const declared = (op: string) => {
    const fromManifest = (manifest.operations as unknown as Record<string, { outputSchema?: Record<string, unknown> }>)[op]!
      .outputSchema;
    const fromContract = ashbyContract.operations.find((o) => o.key === op)!.outputSchema;
    expect(fromManifest).toBeDefined();
    expect(fromManifest!.additionalProperties).toBe(false);
    const inner = Object.values(fromManifest!.properties as Record<string, Record<string, unknown>>)[0]!;
    expect(inner.additionalProperties).toBe(false);
    expect(fromContract).toEqual(fromManifest);
    return fromManifest!;
  };
  const conforms = (op: string, out: unknown) => assertOutputSchema(out, declared(op) as never);
  const keysOf = (v: unknown) => Object.keys(v as Record<string, unknown>).sort();

  test("jobs.update (Reconcile path): observed output conforms and keeps the op's own { job } shape", async () => {
    const { calls, impl } = stub([jobUpdated, jobUpdated]);
    const out = (await run("jobs.update", { ...auth, jobId: JOB, title: "Principal Engineer", fetch: impl })) as {
      job: { id: string } | null;
    };
    expect(calls).toHaveLength(2);
    conforms("jobs.update", out);
    const own = await executeJobsUpdate({ ...auth, jobId: JOB, title: "Principal Engineer", fetch: stub([jobUpdated]).impl });
    expect(keysOf(out)).toEqual(keysOf(own));
    expect(out.job?.id).toBe(`ash-job:${JOB}`);
  });

  test("closed schemas reject null results, missing keys and extra properties", async () => {
    const { impl } = stub([jobStatusSet]);
    const good = (await executeJobsSetStatus({ ...auth, jobId: JOB, status: "Closed", fetch: impl })) as {
      job: Record<string, unknown>;
    };
    for (const op of ["jobs.update", "jobs.set_status"]) {
      expect(() => conforms(op, good)).not.toThrow();
      expect(() => conforms(op, { job: null })).toThrow();
      expect(() => conforms(op, { job: { ...good.job, extra: 1 } })).toThrow();
      const { title: _t, ...missing } = good.job;
      expect(() => conforms(op, { job: missing })).toThrow();
    }
    expect(() => conforms("candidates.add_tag", { candidate: null })).toThrow();
  });

  test("set_status and add_tag fail instead of returning null when results are missing", async () => {
    await expect(
      executeJobsSetStatus({ ...auth, jobId: JOB, status: "Closed", fetch: stub([{ success: true }]).impl }),
    ).rejects.toThrow("missing results");
    await expect(
      executeCandidatesAddTag({ ...auth, candidateId: "cand-1", tagId: "tag-1", fetch: stub([{ success: true }]).impl }),
    ).rejects.toThrow("missing results");
  });

  test("jobs.set_status (no reconcile): output conforms and is the op's own output", async () => {
    const input = { ...auth, jobId: JOB, status: "Closed" as const, closeReasonId: "cr-1" };
    const out = await run("jobs.set_status", { ...input, fetch: stub([jobStatusSet]).impl });
    conforms("jobs.set_status", out);
    expect((out as { job: { status: string } }).job.status).toBe("Closed");
    expect(out).toEqual(await executeJobsSetStatus({ ...input, fetch: stub([jobStatusSet]).impl }));
  });

  test("candidates.add_tag (no reconcile): output conforms and is the op's own output", async () => {
    const input = { ...auth, candidateId: "cand-1", tagId: "tag-1" };
    const out = await run("candidates.add_tag", { ...input, fetch: stub([candidateTagAdded]).impl });
    conforms("candidates.add_tag", out);
    expect((out as { candidate: { tags: string[] } }).candidate.tags).toEqual(["Strong candidate"]);
    expect(out).toEqual(await executeCandidatesAddTag({ ...input, fetch: stub([candidateTagAdded]).impl }));
  });
});

// FX-ashby-2: server.ts handleConnectorActionExecute sends the bare handler
// output as result.output (connector/action ride on the envelope, PLAT-OUT-1),
// and crates/appcall-actions validate_output checks exactly that object.
describe("FX-ashby-2 closed top level accepts the bare server output", () => {
  const schemaOf = (op: string) =>
    (manifest.operations as unknown as Record<string, { outputSchema: Record<string, unknown> }>)[op]!.outputSchema;
  const cases: [string, () => Promise<unknown>][] = [
    ["jobs.update", () => run("jobs.update", { ...auth, jobId: JOB, title: "Principal Engineer", fetch: stub([jobUpdated, jobUpdated]).impl })],
    ["jobs.set_status", () => run("jobs.set_status", { ...auth, jobId: JOB, status: "Closed", fetch: stub([jobStatusSet]).impl })],
    ["candidates.add_tag", () => run("candidates.add_tag", { ...auth, candidateId: "cand-1", tagId: "tag-1", fetch: stub([candidateTagAdded]).impl })],
  ];
  for (const [op, dispatch] of cases) {
    test(`${op}: server result.output passes the closed schema; merged metadata would not`, async () => {
      const out = await dispatch();
      const { output } = splitOperationMetadata(out);
      expect(schemaOf(op).additionalProperties).toBe(false);
      expect(() => assertOutputSchema(output, schemaOf(op) as never)).not.toThrow();
      const merged = { ...(output as Record<string, unknown>), connector: "ashby", action: op };
      expect(() => assertOutputSchema(merged, schemaOf(op) as never)).toThrow("Unexpected property");
    });
  }
});
