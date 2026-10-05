import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteUserEmails,
  getUserCodespace,
  listOrgMemberships,
  setPrimaryEmailVisibility,
  updateUserCodespace,
} from "../src/actions";
import {
  validateDeleteUserEmailsInput,
  validateListOrgMembershipsInput,
  validateSetPrimaryEmailVisibilityInput,
  validateUpdateUserCodespaceInput,
} from "../src/gap_g5";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "user.codespaces.get": { methodPath: "GET /user/codespaces/{codespace_name}", sideEffect: "read" },
  "user.codespaces.update": { methodPath: "PATCH /user/codespaces/{codespace_name}", sideEffect: "write" },
  "user.emails.delete": { methodPath: "DELETE /user/emails", sideEffect: "write" },
  "user.email.visibility.set": { methodPath: "PATCH /user/email/visibility", sideEffect: "write" },
  "user.memberships.orgs.list": { methodPath: "GET /user/memberships/orgs", sideEffect: "read" },
};

type Seen = { url: string; method: string; body?: string };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github gap G5 user codespaces emails memberships", () => {
  test("version is 0.76.0 at 782 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.76.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(782);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 732, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 388, write: 329, absent: 15 });
  });

  test("the five G5 ops are present, omit all three effect keys, and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(5);
    let reads = 0;
    let writes = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      if (meta.sideEffect === "read") reads += 1;
      else writes += 1;
    }
    expect(reads).toBe(2);
    expect(writes).toBe(3);
  });

  test("validators enforce codespace update fields, emails, visibility, and membership state", () => {
    expect(validateUpdateUserCodespaceInput({ codespaceName: "cs1", displayName: "Dev" }))
      .toEqual({ codespaceName: "cs1", displayName: "Dev" });
    expect(() => validateUpdateUserCodespaceInput({ codespaceName: "cs1" })).toThrow(/machine|displayName|recentFolders/);
    expect(validateDeleteUserEmailsInput({ emails: ["a@b.co"] })).toEqual({ emails: ["a@b.co"] });
    expect(validateSetPrimaryEmailVisibilityInput({ visibility: "private" })).toEqual({ visibility: "private" });
    expect(() => validateSetPrimaryEmailVisibilityInput({ visibility: "hidden" })).toThrow(/visibility/);
    expect(validateListOrgMembershipsInput({ state: "active", perPage: 10 }))
      .toEqual({ state: "active", perPage: 10 });
    expect(() => validateListOrgMembershipsInput({ state: "bogus" })).toThrow(/state/);
  });

  test("dry-run wrappers return validated payloads", () => {
    expect(getUserCodespace({ codespaceName: "cs1" }))
      .toMatchObject({ action: "user.codespaces.get", validated: { codespaceName: "cs1" } });
    expect(listOrgMemberships({ state: "pending" }))
      .toMatchObject({ action: "user.memberships.orgs.list", validated: { state: "pending" } });
  });

  test("codespace get/update and email delete/visibility wire paths; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const get = recorder([json({
      id: 1, name: "cs1", display_name: "Dev", state: "Available",
      machine: { name: "standardLinux" }, recent_folders: ["/work"],
    })]);
    expect(await getUserCodespace({ accessToken: "t", fetch: get.fetch, codespaceName: "cs1" }))
      .toMatchObject({ codespace: { id: 1, name: "cs1", displayName: "Dev", machineName: "standardLinux" } });
    expect(get.seen[0].url).toContain("/user/codespaces/cs1");

    const upd = recorder([json({
      id: 1, name: "cs1", display_name: "New", state: "Available",
      machine: { name: "standardLinux" }, recent_folders: [],
    })]);
    await updateUserCodespace({
      accessToken: "t", fetch: upd.fetch, codespaceName: "cs1", displayName: "New", machine: "standardLinux",
    });
    expect(upd.seen[0].method).toBe("PATCH");
    expect(JSON.parse(upd.seen[0].body!)).toEqual({ display_name: "New", machine: "standardLinux" });

    const del = recorder([empty(204)]);
    expect(await deleteUserEmails({ accessToken: "t", fetch: del.fetch, emails: ["a@b.co"] }))
      .toMatchObject({ deleted: true, emails: ["a@b.co"] });
    expect(JSON.parse(del.seen[0].body!)).toEqual({ emails: ["a@b.co"] });

    const missing = recorder([empty(404)]);
    await expect(deleteUserEmails({ accessToken: "t", fetch: missing.fetch, emails: ["x@y.z"] }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const vis = recorder([json([{ email: "a@b.co", primary: true, verified: true, visibility: "private" }])]);
    expect(await setPrimaryEmailVisibility({ accessToken: "t", fetch: vis.fetch, visibility: "private" }))
      .toMatchObject({ emails: [{ email: "a@b.co", visibility: "private" }] });
  });

  test("org memberships list filters state and normalizes organization", async () => {
    const list = recorder([json([{
      url: "https://api.github.com/orgs/octo/memberships/mona",
      state: "active",
      role: "admin",
      organization: { login: "octo", id: 9 },
    }])]);
    expect(await listOrgMemberships({ accessToken: "t", fetch: list.fetch, state: "active", perPage: 5 }))
      .toMatchObject({ memberships: [{ state: "active", role: "admin", organizationLogin: "octo", organizationId: 9 }] });
    expect(list.seen[0].url).toContain("state=active");
    expect(list.seen[0].url).toContain("per_page=5");
  });
});
