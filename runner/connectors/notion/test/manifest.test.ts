import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("notion connector manifest", () => {
  test("declares setup, operations, and network controls", () => {
    expect(manifest.key).toBe("notion");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields[0]).toMatchObject({
      key: "notionToken",
      required: true,
      secret: true,
    });
    expect(manifest.network.allowedHosts).toEqual(["api.notion.com"]);
    expect(manifest.operations["credentials.validate"].kind).toBe("action");
    expect(manifest.operations["comments.create"].kind).toBe("action");
    expect(manifest.operations["comments.list"].kind).toBe("action");
    expect(manifest.operations["databases.get"].kind).toBe("action");
    expect(manifest.operations["databases.items.create"].kind).toBe("action");
    expect(manifest.operations["databases.items.get"].kind).toBe("action");
    expect(manifest.operations["databases.items.query"].kind).toBe("action");
    expect(manifest.operations["databases.items.restore"].kind).toBe("action");
    expect(manifest.operations["databases.items.trash"].kind).toBe("action");
    expect(manifest.operations["databases.items.update"].kind).toBe("action");
    expect(manifest.operations["documents.blocks.append"].kind).toBe("action");
    expect(manifest.operations["documents.blocks.list"].kind).toBe("action");
    expect(manifest.operations["documents.create"].kind).toBe("action");
    expect(manifest.operations["documents.get"].kind).toBe("action");
    expect(manifest.operations["documents.restore"].kind).toBe("action");
    expect(manifest.operations["documents.search"].kind).toBe("action");
    expect(manifest.operations["documents.trash"].kind).toBe("action");
    expect(manifest.operations["users.list"].kind).toBe("sync");
    expect(manifest.operations.healthcheck.kind).toBe("action");
    expect(manifest.models).toContain("document");
    expect(manifest.models).toContain("user");
  });
});
