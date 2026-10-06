import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("buildium connector", () => {
  test("exposes v0.2.0 HTTP actions and event-only webhooks", () => {
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations as Record<string, { kind?: string; sideEffect?: string; request?: unknown; description?: string; inputSchema?: unknown } >);
    const http = ops.filter(([, op]) => op.kind !== "webhook");
    const hooks = ops.filter(([, op]) => op.kind === "webhook");
    expect(http.length).toBeGreaterThanOrEqual(16);
    expect(http.length).toBeLessThanOrEqual(24);
    expect(hooks.length).toBeGreaterThan(0);
    for (const [, op] of http) {
      expect(op.kind).toBe("action");
      expect(op.description).toBeTruthy();
      expect(op.inputSchema && typeof op.inputSchema === "object").toBe(true);
    }
    for (const [, op] of hooks) {
      expect(op.sideEffect).toBe("read");
      expect(op.request).toBeUndefined();
    }
  });
});
