import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("github connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "github",
      status: "ok",
      source: "connector",
    });
  });
});
