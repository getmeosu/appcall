import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteReleaseAsset,
  updateReleaseAsset,
} from "../src/actions";

const PATHS = {
  "releases.assets.delete": "DELETE /repos/{owner}/{repo}/releases/assets/{asset_id}",
  "releases.assets.update": "PATCH /repos/{owner}/{repo}/releases/assets/{asset_id}",
} as const;

const OMIT = [
  "releases.assets.delete",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github write card 16 release asset delete and update", () => {
  test("version is 0.74.0 at 756 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.74.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(756);
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
    expect(kinds).toEqual({ action: 706, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 376, write: 315, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    for (const key of OMIT) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["releases.assets.update"].effectPolicy).toBe("Reconcile");
    expect(ops["releases.assets.update"].reconcile).toBe("releases.assets.get");
    expect(ops["releases.assets.update"].effect).toBeUndefined();
    expect(String(ops["releases.assets.get"].description)).toContain(
      "GET /repos/{owner}/{repo}/releases/assets/{asset_id}",
    );
    expect(ops["releases.assets.delete"].inputSchema.properties.assetId).toBeDefined();
    expect(ops["releases.assets.update"].inputSchema.properties.assetId).toBeDefined();
    expect(ops["releases.assets.update"].inputSchema.properties.name).toBeDefined();
    expect(ops["releases.assets.update"].inputSchema.properties.label).toBeDefined();
    expect(ops["releases.assets.update"].inputSchema.properties.state).toBeDefined();
    expect(ops["releases.assets.update"].inputSchema.properties.state.enum).toBeUndefined();
    expect(ops["releases.delete"].effectPolicy).toBe("Idempotent");
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return json(status, body);
    };

    const deleted = await deleteReleaseAsset({
      accessToken: token, owner: "acme", repo: "app", assetId: 9, fetch: fetchOf(204),
    });
    expect(deleted).toMatchObject({ action: "releases.assets.delete", deleted: true, assetId: 9 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/releases/assets/9");

    const asset = { id: 9, name: "app.zip", label: "linux", state: "uploaded" };
    const updated = await updateReleaseAsset({
      accessToken: token,
      owner: "acme",
      repo: "app",
      assetId: 9,
      name: "app.zip",
      label: "linux",
      state: "uploaded",
      fetch: fetchOf(200, asset),
    });
    expect(updated.asset).toEqual(asset);
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/repos/acme/app/releases/assets/9");
    expect(calls.at(-1)).toContain(JSON.stringify({ name: "app.zip", label: "linux", state: "uploaded" }));

    await expect(deleteReleaseAsset({
      accessToken: token, owner: "acme", repo: "app", assetId: 99, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(updateReleaseAsset({
      accessToken: token, owner: "acme", repo: "app", assetId: 99, name: "x", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => deleteReleaseAsset({ owner: "acme", repo: "app" } as never)).toThrow();
    expect(() => updateReleaseAsset({ owner: "acme", repo: "app", assetId: 1, state: "" } as never)).toThrow();
    expect(deleteReleaseAsset({ owner: "acme", repo: "app", assetId: 1 })).toMatchObject({
      action: "releases.assets.delete", validated: { owner: "acme", repo: "app", assetId: 1 },
    });
    expect(updateReleaseAsset({ owner: "acme", repo: "app", assetId: 1, name: "n", label: "l" })).toMatchObject({
      action: "releases.assets.update",
      validated: { owner: "acme", repo: "app", assetId: 1, name: "n", label: "l" },
    });
  });
});
