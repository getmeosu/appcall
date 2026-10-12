import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

type Op = { kind: string; sideEffect?: string; requiredScopes?: string[] };
const ops = manifest.operations as Record<string, Op>;
// Zoom classic scopes taken from each op's documented OAuth list (Meetings, Users, Whiteboard, IQ, Marketplace specs).
// These are not yet in auth.scopes; extending the grant is a separate card.
const NOT_YET_GRANTED = ["account:read:admin", "iq_coaching:read", "iq_comment:read", "iq_comment:write", "iq_conversation:read", "iq_conversation:write", "iq_crm:read:admin", "iq_crm:write", "iq_crm:write:admin", "iq_deal:read", "iq_deal:write", "iq_playlist:read", "marketplace_app:read", "marketplace_custom_fields:read", "marketplace_entitlement:read", "meeting_summary:read", "recording:read:admin", "whiteboard_classification_labels:write:admin", "whiteboard_collaborator:write", "whiteboard_content:read", "whiteboard_export:write", "whiteboard_file:read", "whiteboard_file:write", "whiteboard_import:write", "whiteboard_project:read", "whiteboard_project:write", "whiteboard_project_collaborator:read", "whiteboard_project_collaborator:write", "whiteboard_share_setting:write"];

describe("ZM-AUTH-1 requiredScopes", () => {
  test("every action declares exactly one Zoom scope; webhooks declare none", () => {
    let n = 0;
    for (const [key, op] of Object.entries(ops)) {
      if (op.kind === "webhook") { expect([key, op.requiredScopes]).toEqual([key, undefined]); continue; }
      n++;
      expect([key, op.requiredScopes?.length]).toEqual([key, 1]);
      expect(op.requiredScopes![0]).toMatch(/^[a-z_]+:(read|write)(:admin)?$/);
    }
    expect(n).toBe(110);
  });

  test("read ops need a read scope", () => {
    for (const [key, op] of Object.entries(ops)) {
      if (op.kind === "action" && op.sideEffect === "read" && key !== "marketplace.manifest.validate")
        expect(`${key}:${op.requiredScopes![0]}`).toContain(":read");
    }
  });

  test("scopes are either granted or on the known extension list", () => {
    const granted = new Set(manifest.auth.scopes);
    const extra = new Set<string>();
    for (const op of Object.values(ops)) for (const s of op.requiredScopes ?? []) if (!granted.has(s)) extra.add(s);
    expect([...extra].sort()).toEqual([...NOT_YET_GRANTED].sort());
  });

  test("spot checks", () => {
    expect(ops["meetings.get"].requiredScopes).toEqual(["meeting:read"]);
    expect(ops["meetings.delete"].requiredScopes).toEqual(["meeting:write"]);
    expect(ops["whiteboards.delete"].requiredScopes).toEqual(["whiteboard:write"]);
    expect(ops["archive_files.list"].requiredScopes).toEqual(["recording:read:admin"]);
    expect(ops["healthcheck"].requiredScopes).toEqual(["user:read"]);
  });
});
