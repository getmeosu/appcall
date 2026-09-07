import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
const operation = "normalized.post.create";
it("declares a write with the versioned normalized output contract", () => {
  const op = (manifest.operations as Record<string, any>)[operation];
  expect(op).toBeDefined();
  expect(op.sideEffect).toBe("write");
  expect(op.outputSchema.required).toEqual(expect.arrayContaining(["id", "provider", "providerPostId", "modelVersion", "raw"]));
  expect(op.outputSchema.properties.modelVersion.enum).toEqual(["2026-09-05"]);
});
it("rejects missing or empty text before publication", async () => {
  const action = compileDeclarativeConnector(manifest as never).actions[operation];
  expect(action).toBeFunction();
  for (const text of [undefined, ""]) {
    let called = false;
    try {
      await action!({ text, channelId: "456", botToken: "test-only", accessToken: "test-only", instance: "social.example.org", fetch: async () => { called = true; return new Response("{}"); } });
      throw new Error("unexpected success");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_ACTION_INPUT" });
    }
    expect(called).toBe(false);
  }
});
