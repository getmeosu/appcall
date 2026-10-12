import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { normalizeCodeScanningInstance } from "../src/alerts";
import { normalizeGist as normalizeCard12Gist, normalizeLabel as normalizeCard12Label } from "../src/card12_reads";
import { normalizeLabelSearch, normalizeTopic } from "../src/card7_reads";
import { normalizeGitHubGist } from "../src/gists";
import { normalizeGitHubHookDelivery, normalizeGitHubInvitation, normalizeRuleSuite } from "../src/governance";
import { normalizeLabel } from "../src/labels_milestones";
import { normalizeGitHubNotification, normalizeGitHubTeam } from "../src/notifications_social";
import { normalizeOrganizationRole } from "../src/orgs_reads";
import { normalizePublicRepository, normalizeRepoLicense } from "../src/repos_reads";
import {
  normalizeGitHubEmail,
  normalizeGitHubEvent,
  normalizeGitHubGpgKey,
  normalizeGitHubMarketplacePurchase,
} from "../src/users";

// TR-5c (v0.89.4, +0 ops): continues the exact-schema nullability pass against pinned spec
// rest-api-description 58b1e0c0. A field that is optional or nullable in the exact component schema
// comes back null, never a fabricated '' / 0. Spec-required, non-nullable fields keep their fallback.
// Every assertion below fails on v0.89.3 (TR-5b d1bd0962).

const ops = manifest.operations as Record<string, { outputSchema?: Record<string, unknown> }>;

function typeAt(op: string, path: string): unknown {
  let s = ops[op]?.outputSchema as Record<string, any>;
  for (const raw of path.split(".")) {
    const arr = raw.endsWith("[]");
    s = s.properties[arr ? raw.slice(0, -2) : raw];
    if (arr) s = s.items;
  }
  return s.type;
}

describe("TR-5c: sparse upstream objects normalize to null, not fabricated values", () => {
  test("code-scanning-alert-instance: all 11 fields are optional (state nullable) -> null, not '' / 0", () => {
    const i = normalizeCodeScanningInstance({ state: null, message: {}, location: {} });
    expect([i.ref, i.analysisKey, i.environment, i.category, i.state, i.commitSha, i.message, i.path, i.startLine, i.endLine, i.htmlUrl]).toEqual(
      [null, null, null, null, null, null, null, null, null, null, null],
    );
    const full = normalizeCodeScanningInstance({ ref: "refs/heads/main", location: { path: "a.ts", start_line: 3, end_line: 4 } });
    expect([full.ref, full.path, full.startLine, full.endLine]).toEqual(["refs/heads/main", "a.ts", 3, 4]);
  });

  test("notifications_social: thread last_read_at (nullable), team description (nullable) / privacy (optional)", () => {
    const n = normalizeGitHubNotification({ id: "1", unread: true, reason: "mention", updated_at: "t", last_read_at: null, subject: {}, repository: {} } as never);
    expect(n.lastReadAt).toBeNull();
    const t = normalizeGitHubTeam({ id: 1, name: "n", slug: "s", description: null, permission: "pull" } as never);
    expect([t.description, t.privacy]).toEqual([null, null]);
    expect([t.name, t.slug]).toEqual(["n", "s"]);
  });

  test("labels / gists: label description and gist description are nullable", () => {
    expect(normalizeLabel({ id: 1, name: "bug", color: "f00", description: null }).description).toBeNull();
    expect(normalizeCard12Label({ name: "bug", color: "f00", description: null }).description).toBeNull();
    expect(normalizeGitHubGist({ id: "g", description: null } as never).description).toBeNull();
    expect(normalizeCard12Gist({ id: "g", description: null, public: true }).description).toBeNull();
  });

  test("users: event type / created_at, email visibility, gpg-key name, marketplace dates (nullable)", () => {
    const e = normalizeGitHubEvent({ id: "1", type: null, actor: { login: "a" }, repo: { name: "o/r" }, created_at: null } as never);
    expect([e.type, e.createdAt]).toEqual([null, null]);
    expect([e.actor, e.repo]).toEqual(["a", "o/r"]);
    expect(normalizeGitHubEmail({ email: "x@y", primary: true, verified: true, visibility: null } as never).visibility).toBeNull();
    expect(normalizeGitHubGpgKey({ id: 1, key_id: "k", public_key: "p", name: null } as never).name).toBeNull();
    const m = normalizeGitHubMarketplacePurchase({ billing_cycle: "monthly", next_billing_date: null, free_trial_ends_on: null, updated_at: null } as never);
    expect([m.nextBillingDate, m.freeTrialEndsOn, m.updatedAt]).toEqual([null, null, null]);
  });

  test("repos_reads: license download_url (nullable), public repository description (nullable)", () => {
    expect(normalizeRepoLicense({ name: "LICENSE", path: "LICENSE", download_url: null, license: {} }).downloadUrl).toBeNull();
    expect(normalizePublicRepository({ id: 1, name: "r", full_name: "o/r", description: null }).description).toBeNull();
  });

  test("governance: hook-delivery action, invitation invitee / inviter, rule-suite fields (optional / nullable)", () => {
    expect(normalizeGitHubHookDelivery({ id: 1, guid: "g", event: "push", action: null } as never).action).toBeNull();
    const inv = normalizeGitHubInvitation({ id: 1, invitee: null, inviter: null } as never);
    expect([inv.invitee, inv.inviter]).toEqual([null, null]);
    const r = normalizeRuleSuite({ id: 9, actor_name: null } as never);
    expect([r.actorName, r.ref, r.result, r.beforeSha, r.afterSha]).toEqual([null, null, null, null, null]);
    expect(r.ruleSuiteId).toBe(9);
  });

  test("search (card7): topic display_name / short_description / description, label description (nullable)", () => {
    const t = normalizeTopic({ name: "rust", display_name: null, short_description: null, description: null });
    expect([t.displayName, t.shortDescription, t.description]).toEqual([null, null, null]);
    expect(t.name).toBe("rust");
    expect(normalizeLabelSearch({ id: 1, name: "bug", description: null }).description).toBeNull();
  });

  test("orgs_reads: organization-role description / source (optional, nullable)", () => {
    const r = normalizeOrganizationRole({ id: 1, name: "role", permissions: [] });
    expect([r.description, r.source]).toEqual([null, null]);
    expect(r.name).toBe("role");
  });
});

describe("TR-5c: widened output schemas admit the nulls", () => {
  const ev = ["events[].type", "events[].createdAt"];
  const widened: Record<string, string[]> = {
    "code_scanning.alerts.instances.list": ["ref", "analysisKey", "environment", "category", "state", "commitSha", "message", "path", "htmlUrl"].map((f) => `instances[].${f}`),
    "gists.create": ["gist.description"],
    "gists.get": ["gist.description"],
    "gists.update": ["gist.description"],
    "gists.list": ["gists[].description"],
    "search.topics.list": ["items[].displayName", "items[].shortDescription", "items[].description"],
    "search.labels.list": ["items[].description"],
    "user.emails.list": ["emails[].visibility"],
    "user.public_emails.list": ["emails[].visibility"],
    "users.events.list": ev,
    "users.received_events.list": ev,
    "users.events.public.list": ev,
    "users.received_events.public.list": ev,
    "users.events.orgs.list": ["events[].type"],
    "orgs.events.list": ["events[].type"],
    "users.gpg_keys.list": ["keys[].name"],
    "orgs.organization_roles.get": ["role.description"],
  };
  for (const [op, paths] of Object.entries(widened)) {
    test(op, () => {
      for (const p of paths) expect(typeAt(op, p)).toContain("null");
    });
  }
});
