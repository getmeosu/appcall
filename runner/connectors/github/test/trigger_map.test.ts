import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import specActions from "../fixtures/trigger_actions_spec.json";
import servedDoc from "../fixtures/runtime-served.json";
import { GITHUB_TRIGGERS, matchesTrigger, triggerOperations, type TriggerEntry } from "../src/trigger_map";

// GitHub TRIG-4 (v0.86.11, +1 webhook op; 797 actions + 47 webhook + 4 sync = 848; 46 Composio triggers,
// 37 covered / 0 partial / 9 missing; TRIG-3b: the 9 polled slugs are covered, 46/0/0): webhook.branch_protection_configuration completes BRANCH_CHANGED.
// GitHub TRIG-2 (v0.86.10, +0 ops; 797 actions + 46 webhook triggers + 4 sync = 847). The typed
// Composio trigger map (src/trigger_map.ts) and the coverage map's triggers section agree, every
// mapped action is a real webhook action in the pinned spec, and matchesTrigger() fires exactly on
// the mapped event / actions / field filter. runtimeServed is exactly the set proven end to end by
// crates/appcall-api/tests/github_poll_e2e.rs (fixtures/runtime-served.json): the 9 polled slugs.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const entries = Object.entries(GITHUB_TRIGGERS) as [string, TriggerEntry][];
const cov = (coverage as any).triggers;
const SPEC = (specActions as any).events as Record<string, { schemas: string[]; actions: string[] }>;

const served = new Set<string>(servedDoc.slugs as string[]);

describe("TRIG-2: the trigger map and the coverage map", () => {
  test("46 Composio slugs: 20 named, 13 one-event, 4 ambiguous, 9 not-named", () => {
    expect(entries).toHaveLength(46);
    const byClass: Record<string, number> = {};
    for (const [, e] of entries) byClass[e.class] = (byClass[e.class] ?? 0) + 1;
    expect(byClass).toEqual({ named: 20, "one-event": 13, ambiguous: 4, "not-named": 9 });
  });

  test("status follows the manifest: covered iff every mapped event has a webhook op, or (not-named) its sync polls the slug", () => {
    const counts: Record<string, number> = {};
    for (const [slug, e] of entries) {
      const present = triggerOperations(slug).filter((k) => ops[k]?.kind === "webhook");
      const sync = e.polling ? ops[e.polling.proposedSync] : undefined;
      const polled = sync?.kind === "sync" && [...(sync.poll?.onNew ?? []), ...(sync.poll?.onChanged ?? [])].includes(slug);
      const want = e.match.length === 0 ? (polled ? "covered" : "missing") : present.length === 0 ? "missing" : present.length < e.match.length ? "partial" : "covered";
      expect(e.status, slug).toBe(want);
      counts[e.status] = (counts[e.status] ?? 0) + 1;
    }
    expect(counts).toEqual({ covered: 46 });
    expect(GITHUB_TRIGGERS.GITHUB_BRANCH_CHANGED_TRIGGER!.status).toBe("covered");
  });

  test("the coverage map's triggers section mirrors the typed map", () => {
    expect(Object.keys(cov.slugs).sort()).toEqual(entries.map(([s]) => s).sort());
    for (const [slug, e] of entries) {
      const c = cov.slugs[slug];
      expect(c.class, slug).toBe(e.class);
      expect(c.status, slug).toBe(e.status);
      expect(c.runtimeServed, slug).toBe(served.has(slug));
      expect(c.ops, slug).toEqual(triggerOperations(slug).filter((k) => ops[k]?.kind === "webhook"));
      expect(c.duplicateOf, slug).toBe(e.duplicateOf);
      expect(c.polling, slug).toEqual(e.polling);
    }
    expect(cov.counts).toEqual({ total: 46, covered: 46, partial: 0, missing: 0, runtimeServed: 9, distinctAfterDedupe: 44 });
  });

  test("runtime-served is exactly the e2e-proven set: the 9 polled slugs, no webhook slug (WH-1 has no e2e yet)", () => {
    for (const [slug, e] of entries) expect(e.runtimeServed, slug).toBe(served.has(slug));
    expect(served.size).toBe(9);
    const polled = new Set(Object.values(ops).flatMap((op) => (op.poll ? [...(op.poll.onNew ?? []), ...(op.poll.onChanged ?? [])] : [])));
    expect([...served].sort()).toEqual([...polled].sort());
    for (const slug of served) expect(cov.slugs[slug].ops, slug).toEqual([]);
  });

  test("duplicate pairs: ISSUE_ADDED = ISSUE_CREATED, STAR_ADDED = NEW_STARGAZER; same match, recorded once", () => {
    const dups = entries.filter(([, e]) => e.duplicateOf);
    expect(dups.map(([s, e]) => [s, e.duplicateOf])).toEqual([
      ["GITHUB_ISSUE_ADDED_EVENT", "GITHUB_ISSUE_CREATED_TRIGGER"],
      ["GITHUB_STAR_ADDED_EVENT", "GITHUB_NEW_STARGAZER_ADDED_TRIGGER"],
    ]);
    for (const [slug, e] of dups) {
      const target = GITHUB_TRIGGERS[e.duplicateOf!]!;
      expect(target.duplicateOf, slug).toBeUndefined();
      expect(e.match, slug).toEqual(target.match);
    }
  });

  test("the 9 not-named slugs carry a polling plan: an existing read action and a sync that polls the slug", () => {
    const missing = entries.filter(([, e]) => e.class === "not-named");
    expect(missing).toHaveLength(9);
    const polled: string[] = [];
    for (const [slug, e] of missing) {
      expect(e.class, slug).toBe("not-named");
      expect(e.match, slug).toEqual([]);
      expect(ops[e.polling!.readOp]?.kind, slug).toBe("action");
      const sync = ops[e.polling!.proposedSync];
      // TRIG-3a (v0.88.0) and TRIG-3b (v0.89.0) declare the planned sync with a poll block tagging the slug.
      expect(sync.kind, slug).toBe("sync");
      expect([...(sync.poll?.onNew ?? []), ...(sync.poll?.onChanged ?? [])], slug).toContain(slug);
      polled.push(slug);
    }
    expect(polled.sort()).toEqual([
      "GITHUB_ARTIFACT_CREATED_TRIGGER",
      "GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER",
      "GITHUB_FOLLOWER_EVENT",
      "GITHUB_README_CHANGED_TRIGGER",
      "GITHUB_RELEASE_ASSET_ADDED_TRIGGER",
      "GITHUB_REPOSITORY_CONTENT_CHANGED_TRIGGER",
      "GITHUB_REPOSITORY_NOTIFICATION_RECEIVED_TRIGGER",
      "GITHUB_WORKFLOW_ADDED_TRIGGER",
      "GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED",
    ]);
    for (const [slug, e] of entries) if (e.class !== "not-named") expect(e.polling, slug).toBeUndefined();
  });

  test("every mapped action is a webhook action in the pinned spec (webhook-<event>-<action>)", () => {
    for (const [slug, e] of entries) {
      for (const m of e.match) {
        const spec = SPEC[m.event];
        expect(spec, `${slug} ${m.event}`).toBeDefined();
        expect(spec!.schemas.length, `${slug} ${m.event}`).toBeGreaterThan(0);
        for (const a of m.actions ?? []) expect(spec!.actions, `${slug} ${m.event}.${a}`).toContain(a);
      }
    }
  });
});

describe("TRIG-2: op accounting (actions and triggers counted separately)", () => {
  test("v0.87.0: 797 actions + 47 webhook ops + 4 sync = 848 ops (46 Composio triggers)", () => {
    expect(manifest.version).toBe("0.89.6");
    const kinds: Record<string, number> = {};
    for (const op of Object.values(ops)) kinds[op.kind] = (kinds[op.kind] ?? 0) + 1;
    expect(kinds).toEqual({ action: 801, webhook: 47, sync: 12 });
    expect(Object.keys(ops)).toHaveLength(860);
  });
});

describe("TRIG-2: matchesTrigger", () => {
  const base = (m: { where?: { kind: string; value?: string } }) => {
    switch (m.where?.kind) {
      case "refType": return { ref_type: m.where.value, ref: "feature/x" };
      case "refPrefix": return { ref: "release/1.0" };
      case "assigneeIsViewer": return { assignee: { login: "octocat" } };
      case "tagPushCreated": return { ref: "refs/tags/v1.0.0", created: true };
      default: return {};
    }
  };
  const ctx = { viewerLogin: "octocat", refPrefix: "release/" };

  for (const [slug, e] of entries) {
    if (e.class === "not-named") continue;
    test(`${slug}: fires on each mapped event/action, not on other actions or events`, () => {
      for (const m of e.match) {
        const actions = m.actions ?? [undefined];
        for (const a of actions) {
          const payload = { ...base(m), ...(a ? { action: a } : {}) };
          expect(matchesTrigger(slug, m.event, payload, ctx), `${m.event}.${a}`).toBe(true);
          expect(matchesTrigger(slug, "meta", payload, ctx), `wrong event ${m.event}.${a}`).toBe(false);
        }
        if (m.actions) {
          const others = SPEC[m.event]!.actions.filter((a) => !m.actions!.includes(a)
            && !e.match.some((o) => o.event === m.event && (o.actions ?? []).includes(a)));
          for (const a of others) expect(matchesTrigger(slug, m.event, { ...base(m), action: a }, ctx), `${m.event}.${a}`).toBe(false);
          expect(matchesTrigger(slug, m.event, base(m), ctx), `${m.event} without action`).toBe(false);
        }
      }
    });
  }

  test("field filters", () => {
    expect(matchesTrigger("GITHUB_BRANCH_CREATED_TRIGGER", "create", { ref_type: "branch", ref: "b" })).toBe(true);
    expect(matchesTrigger("GITHUB_BRANCH_CREATED_TRIGGER", "create", { ref_type: "tag", ref: "v1" })).toBe(false);
    expect(matchesTrigger("GITHUB_REPOSITORY_TAG_CREATED_TRIGGER", "create", { ref_type: "tag", ref: "v1" })).toBe(true);
    expect(matchesTrigger("GITHUB_REPOSITORY_TAG_CREATED_TRIGGER", "create", { ref_type: "branch", ref: "b" })).toBe(false);
    expect(matchesTrigger("GITHUB_REPOSITORY_TAG_CREATED_TRIGGER", "push", { ref: "refs/tags/v1", created: true })).toBe(true);
    expect(matchesTrigger("GITHUB_REPOSITORY_TAG_CREATED_TRIGGER", "push", { ref: "refs/tags/v1", created: false })).toBe(false);
    expect(matchesTrigger("GITHUB_REPOSITORY_TAG_CREATED_TRIGGER", "push", { ref: "refs/heads/main", created: true })).toBe(false);
    expect(matchesTrigger("GITHUB_GIT_REFERENCE_CREATED_TRIGGER", "create", { ref: "release/1" }, { refPrefix: "release/" })).toBe(true);
    expect(matchesTrigger("GITHUB_GIT_REFERENCE_CREATED_TRIGGER", "create", { ref: "feature/1" }, { refPrefix: "release/" })).toBe(false);
    expect(matchesTrigger("GITHUB_GIT_REFERENCE_CREATED_TRIGGER", "create", { ref: "feature/1" })).toBe(true);
    expect(matchesTrigger("GITHUB_ISSUE_ASSIGNED_TO_ME_TRIGGER", "issues", { action: "assigned", assignee: { login: "octocat" } }, { viewerLogin: "octocat" })).toBe(true);
    expect(matchesTrigger("GITHUB_ISSUE_ASSIGNED_TO_ME_TRIGGER", "issues", { action: "assigned", assignee: { login: "other" } }, { viewerLogin: "octocat" })).toBe(false);
    expect(matchesTrigger("GITHUB_ISSUE_ASSIGNED_TO_ME_TRIGGER", "issues", { action: "assigned", assignee: { login: "octocat" } })).toBe(false);
    expect(matchesTrigger("GITHUB_NOT_A_TRIGGER", "issues", { action: "opened" })).toBe(false);
  });

  test("whole-event slugs fire on any payload of their event", () => {
    for (const slug of ["GITHUB_COMMIT_EVENT", "GITHUB_ISSUE_EVENT_OCCURRED_TRIGGER", "GITHUB_WORKFLOW_JOB_STATE_CHANGED"]) {
      const [m] = GITHUB_TRIGGERS[slug]!.match;
      expect(m!.actions, slug).toBeUndefined();
      expect(matchesTrigger(slug, m!.event, { action: "anything" }), slug).toBe(true);
    }
  });
  test("check_run / check_suite carry the GitHub-App-only delivery note; nothing else does", () => {
    const noted = entries.filter(([, e]) => e.note !== undefined).map(([s]) => s);
    expect(noted).toEqual(["GITHUB_CHECK_RUN_STATUS_CHANGED_TRIGGER", "GITHUB_CHECK_SUITE_STATUS_CHANGED_TRIGGER"]);
    const run = GITHUB_TRIGGERS.GITHUB_CHECK_RUN_STATUS_CHANGED_TRIGGER!;
    const suite = GITHUB_TRIGGERS.GITHUB_CHECK_SUITE_STATUS_CHANGED_TRIGGER!;
    expect(run.note).toContain("rerequested");
    expect(run.note).toContain("GitHub Apps");
    expect(suite.note).toContain("requested and rerequested");
    expect(suite.note).toContain("GitHub Apps");
    // The note is informational: the action lists stay as mapped.
    expect(run.match).toEqual([{ event: "check_run", actions: ["completed", "created", "rerequested"] }]);
    expect(suite.match).toEqual([{ event: "check_suite", actions: ["completed", "requested", "rerequested"] }]);
  });
});
