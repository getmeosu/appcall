import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("microsoft-365 connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "microsoft-365",
      status: "ok",
      source: "connector",
    });
  });
});
