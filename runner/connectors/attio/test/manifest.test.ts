import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

describe("attio manifest", () => {
  test("keeps existing keys and deepens records, lists, notes, and tasks", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.attio.com"]);
    expect(manifest.version).toBe("0.2.0");
    expect(Object.keys(manifest.operations)).toEqual([
      "healthcheck",
      "objects.list",
      "objects.get",
      "attributes.list",
      "records.list",
      "records.get",
      "records.create",
      "records.update",
      "records.assert",
      "records.delete",
      "lists.list",
      "lists.get",
      "notes.list",
      "notes.get",
      "notes.create",
      "tasks.list",
      "tasks.get",
      "tasks.create",
      "workspace_members.list",
      "comments.create",
    ]);
    expect(manifest.operations["records.list"].request.method).toBe("POST");
    expect(manifest.operations["records.create"].sideEffect).toBe("write");
    expect(manifest.operations["records.delete"].sideEffect).toBe("destructive");
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
