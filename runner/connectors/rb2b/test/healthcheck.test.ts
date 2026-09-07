import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("rb2b connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "rb2b",
      status: "ok",
      source: "connector",
    });
  });
});
