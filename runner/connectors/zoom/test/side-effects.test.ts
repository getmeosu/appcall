import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { DEPTH_OPS } from "../src/depth";

type Op = { kind: string; sideEffect?: string; title?: string; description?: string };
const ops = manifest.operations as Record<string, Op>;
const DESTRUCTIVE = ["iq.conversations.comments.delete", "iq.conversations.delete", "iq.deals.activities.delete", "meetings.delete", "whiteboards.delete", "whiteboards.projects.delete", "zra.conversations.comments.delete", "zra.conversations.delete", "zra.crm.settings.delete", "zra.deals.activities.delete"];
const WRITE = ["iq.conversations.comments.create", "iq.conversations.comments.update", "iq.conversations.create", "iq.conversations.host.update", "iq.users.conversations.create", "meetings.add_registrant", "meetings.create", "meetings.update", "recordings.delete", "recordings.delete_file", "webinars.add_registrant", "webinars.create", "whiteboards.classification.apply", "whiteboards.classification.remove", "whiteboards.classification.update", "whiteboards.collaborators.add", "whiteboards.collaborators.delete", "whiteboards.collaborators.update", "whiteboards.create", "whiteboards.export.create", "whiteboards.files.upload", "whiteboards.import", "whiteboards.projects.collaborators.add", "whiteboards.projects.collaborators.delete", "whiteboards.projects.collaborators.update", "whiteboards.projects.create", "whiteboards.projects.update", "whiteboards.projects.whiteboards.move", "whiteboards.projects.whiteboards.remove", "whiteboards.share_settings.update", "zra.conversations.comments.create", "zra.conversations.comments.update", "zra.conversations.create", "zra.conversations.host.update", "zra.crm.accounts.create", "zra.crm.contacts.create", "zra.crm.deals.create", "zra.crm.leads.create", "zra.crm.settings.create", "zra.users.conversations.create"];
// Trash-to-recoverable (30 days) recording deletes and re-grantable collaborator removals are write, not destructive.
const REVERSIBLE_DELETES = ["recordings.delete", "recordings.delete_file", "whiteboards.collaborators.delete", "whiteboards.projects.collaborators.delete"];

describe("FX-zoom-1 sideEffect classification", () => {
  test("every operation declares a valid sideEffect", () => {
    for (const [key, op] of Object.entries(ops)) {
      expect([key, ["read", "write", "destructive"].includes(op.sideEffect ?? "")]).toEqual([key, true]);
    }
  });

  test("irreversible deletes are destructive and nothing else is", () => {
    const actual = Object.keys(ops).filter((key) => ops[key].sideEffect === "destructive").sort();
    expect(actual).toEqual([...DESTRUCTIVE].sort());
  });

  test("mutating operations are write", () => {
    for (const key of [...WRITE, ...REVERSIBLE_DELETES]) expect([key, ops[key].sideEffect]).toEqual([key, "write"]);
  });

  test("every depth GET route is read", () => {
    for (const spec of DEPTH_OPS) {
      if (spec.method === "GET") expect([spec.action, ops[spec.action].sideEffect]).toEqual([spec.action, "read"]);
      if (spec.method === "DELETE") expect([spec.action, ops[spec.action].sideEffect === "read"]).toEqual([spec.action, false]);
    }
  });

  test("webhooks stay read", () => {
    for (const op of Object.values(ops)) if (op.kind === "webhook") expect(op.sideEffect).toBe("read");
  });
});

describe("meetings.summary.templates.list endpoint", () => {
  test("targets the documented meeting templates endpoint and says so", () => {
    const spec = DEPTH_OPS.find((item) => item.action === "meetings.summary.templates.list");
    expect(spec?.method).toBe("GET");
    expect(spec?.path).toBe("/v2/users/{userId}/meeting_templates");
    expect(spec?.title).toBe("List meeting templates");
    expect(ops["meetings.summary.templates.list"].title).toBe(spec?.title);
    expect(ops["meetings.summary.templates.list"].description).toBe(spec?.description);
    expect(ops["meetings.summary.templates.list"].sideEffect).toBe("read");
  });
});
