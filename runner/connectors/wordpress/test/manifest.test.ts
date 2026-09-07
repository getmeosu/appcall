import { expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
it("declares secure setup, complete action contracts and write effects", () => {
  const path = new URL("../manifest.json", import.meta.url);
  expect(existsSync(path)).toBe(true);
  const m = JSON.parse(readFileSync(path, "utf8"));
  expect(m.key).toBe("wordpress");
  expect(m.runtime).toBe("bun");
  expect(m.categories).toContain("social");
  expect(m.models.length).toBeGreaterThan(0);
  expect(
    m.auth.setup.fields.filter((f: any) => f.secret).map((f: any) => f.key),
  ).toEqual(["applicationPassword"]);
  expect(m.http.auth.field).toBe("applicationPassword");
  expect(m.auth.setup.fields.find((f: any) => f.key === "host")).toMatchObject({
    required: true,
    secret: false,
  });
  expect(m.network.allowedHosts).toEqual(["{{host}}"]);
  expect(m.http.baseUrl).toBe("https://{{host}}/wp-json/wp/v2");
  expect(Object.keys(m.operations).sort()).toEqual(
    [
      "healthcheck",
      "post.list",
      "post.get",
      "post.create",
      "post.update",
      "page.list",
      "category.list",
    ].sort(),
  );
  for (const [key, value] of Object.entries(m.operations)) {
    const op = value as any;
    expect(op.kind).toBe("action");
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxInputBytes).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeGreaterThan(0);
    expect(op.sideEffect).toBe(/create|update/.test(key) ? "write" : "read");
    expect(op.request).toBeDefined();
  }
  const qa = JSON.parse(
    readFileSync(new URL("../qa.json", import.meta.url), "utf8"),
  );
  for (const s of qa.scenarios) {
    expect(m.operations[s.operation].sideEffect).toBe("read");
    expect(s.expect.assertions.length).toBeGreaterThan(0);
  }
  expect(m.auth.setup.derive).toEqual([
    {
      field: "basicAuth",
      kind: "basic",
      from: ["username", "applicationPassword"],
    },
  ]);
  expect(m.auth.setup.fields.some((f: any) => f.key === "basicAuth")).toBe(
    false,
  );
});
