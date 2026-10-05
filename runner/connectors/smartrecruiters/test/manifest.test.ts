import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const SR1_OPS = [
  "candidates.get",
  "candidates.list",
  "healthcheck",
  "interviews.list",
  "jobs.get",
  "jobs.list",
  "postings.list",
  "users.list",
];

// G1 lock: [sideEffect, effectPolicy, reconcile, OAuth scope].
const G1_EFFECTS: Record<string, [string, string | undefined, string | undefined, string]> = {
  "candidates.create": ["write", undefined, undefined, "candidates_create"],
  "applications.create": ["write", undefined, undefined, "candidates_create"],
  "candidates.update": ["write", "Reconcile", "candidates.get", "candidates_manage"],
  "applications.get": ["read", undefined, undefined, "candidates_read"],
  "applications.update_status": ["write", "Reconcile", "applications.get", "candidates_manage"],
  "applications.status_history": ["read", undefined, undefined, "candidate_status_read"],
  "candidates.tags.get": ["read", undefined, undefined, "candidates_read"],
  "candidates.tags.add": ["write", "Reconcile", "candidates.tags.get", "candidates_manage"],
  "candidates.tags.replace": ["write", "Reconcile", "candidates.tags.get", "candidates_manage"],
  "candidates.attachments.list": ["read", undefined, undefined, "candidates_read"],
  "applications.attachments.list": ["read", undefined, undefined, "candidates_read"],
  "applications.properties.get": ["read", undefined, undefined, "candidates_read"],
  "applications.properties.update": ["write", undefined, undefined, "candidates_manage"],
  "applications.screening_answers.get": ["read", undefined, undefined, "candidates_read"],
  "job_applications.get": ["read", undefined, undefined, "job_applications_read"],
};

const STRICT_KEYS = new Set([
  "type",
  "enum",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "const",
  "title",
  "description",
]);

type Ops = Record<string, Record<string, unknown>>;
const ops = manifest.operations as unknown as Ops;

/** Returns violations of the strict input-schema subset (single type, no pattern/format/oneOf/anyOf/allOf). */
function strictViolations(schema: unknown, path: string): string[] {
  if (schema == null || typeof schema !== "object" || Array.isArray(schema)) return [`${path}: not an object`];
  const out: string[] = [];
  const node = schema as Record<string, unknown>;
  for (const key of Object.keys(node)) {
    if (!STRICT_KEYS.has(key)) out.push(`${path}.${key}`);
  }
  if ("type" in node && typeof node.type !== "string") out.push(`${path}.type (union)`);
  if (node.type === "object" && node.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
  if (node.properties && typeof node.properties === "object") {
    for (const [k, v] of Object.entries(node.properties as Record<string, unknown>)) out.push(...strictViolations(v, `${path}.${k}`));
  }
  if (node.items !== undefined) out.push(...strictViolations(node.items, `${path}[]`));
  return out;
}

describe("SmartRecruiters manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("smartrecruiters");
  });

  it("has version 0.4.0", () => {
    expect(manifest.version).toBe("0.4.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("declares api_key auth with setup fields", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.some((field: { key: string }) => field.key === "apiKey")).toBe(true);
  });

  it("allows expected hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.smartrecruiters.com"]);
  });

  it("uses X-SmartToken header auth", () => {
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-SmartToken",
      value: "{{apiKey}}",
    });
  });

  it("declares P0 list/get + P1 jobs.get/interviews/postings ops", () => {
    expect(manifest.operations["jobs.list"]).toBeTruthy();
    expect(manifest.operations["jobs.get"]).toBeTruthy();
    expect(manifest.operations["postings.list"]).toBeTruthy();
    expect(manifest.operations["candidates.list"]).toBeTruthy();
    expect(manifest.operations["candidates.get"]).toBeTruthy();
    expect(manifest.operations["users.list"]).toBeTruthy();
    expect(manifest.operations["interviews.list"]).toBeTruthy();
  });

  it("healthcheck uses the current Users API, not the deprecated root /users", () => {
    expect(manifest.operations.healthcheck.request.path).toBe("/user-api/v201804/users");
    expect(manifest.operations.healthcheck.request.query).toEqual({ limit: 1 });
  });

  it("declares the 8 SR-1 operations plus the 15 G1 operations (23)", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([...SR1_OPS, ...Object.keys(G1_EFFECTS)].sort());
    expect(Object.keys(manifest.operations)).toHaveLength(23);
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares job/candidate/user/interview models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "user", "interview"]);
  });

  it("G1 ops carry the locked sideEffect / effect keys and no Idempotent anywhere", () => {
    for (const [name, [sideEffect, policy, reconcile]] of Object.entries(G1_EFFECTS)) {
      const op = ops[name]!;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(sideEffect);
      expect(op.effectPolicy).toBe(policy);
      expect(op.reconcile).toBe(reconcile);
      if (reconcile) expect(["sync", "action"]).toContain(String(ops[reconcile]!.kind));
    }
    for (const op of Object.values(ops)) expect(op.effectPolicy).not.toBe("Idempotent");
  });

  it("Reconcile observes take the write's own identifying inputs", () => {
    for (const [name, [, policy, reconcile]] of Object.entries(G1_EFFECTS)) {
      if (policy !== "Reconcile") continue;
      const required = (ops[name]!.inputSchema as { required: string[] }).required;
      const target = ops[reconcile!]!;
      const targetRequired = target.inputSchema ? (target.inputSchema as { required: string[] }).required : ["id"];
      for (const key of targetRequired) expect(required).toContain(key);
    }
  });

  it("G1 input schemas use only the strict subset", () => {
    for (const name of Object.keys(G1_EFFECTS)) {
      expect({ name, violations: strictViolations(ops[name]!.inputSchema, name) }).toEqual({ name, violations: [] });
    }
  });

  it("each G1 op declares its own OAuth scope and the default connect set stays empty", () => {
    expect(manifest.auth.scopes).toEqual([]);
    for (const [name, [, , , scope]] of Object.entries(G1_EFFECTS)) {
      expect(String(ops[name]!.description)).toContain(`OAuth scope`);
      expect(String(ops[name]!.description)).toContain(scope);
    }
  });

  it("candidates.update only accepts fields candidates.get returns verbatim", () => {
    const props = Object.keys((ops["candidates.update"]!.inputSchema as { properties: object }).properties).sort();
    expect(props).toEqual(["email", "firstName", "id", "lastName", "phoneNumber"]);
  });

  it("applications.update_status enumerates the documented CandidateStatusEnum", () => {
    const status = (ops["applications.update_status"]!.inputSchema as { properties: { status: { enum: string[] } } }).properties.status;
    expect(status.enum).toEqual(["LEAD", "NEW", "IN_REVIEW", "INTERVIEW", "OFFERED", "HIRED", "REJECTED", "WITHDRAWN", "TRANSFERRED"]);
  });
});
