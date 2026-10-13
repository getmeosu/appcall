import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "avatars.list": { method: "GET", path: "/avatars" },
  "videos.copy": { method: "POST", path: "/videos/copy" },
  "videos.get": { method: "GET", path: "/videos/{{videoId}}" },
  "videos.list": { method: "GET", path: "/videos" },
  "videos.render": { method: "POST", path: "/videos/render/{{videoId}}" },
  "voices.duration": { method: "PATCH", path: "/voices/duration" },
} as const;

test("Elai manifest keeps one strict JSON route per operation", () => {
  expect(compileDeclarativeConnector(manifest).key).toBe("elai");
  expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  for (const [key, operation] of Object.entries(manifest.operations)) {
    const route = routes[key as keyof typeof routes];
    expect(operation.request.method, key).toBe(route.method);
    expect(operation.request.path, key).toBe(route.path);
    expect(operation.request.baseUrl, key).toBeUndefined();
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.kind, key).toBe("action");
  }
});
