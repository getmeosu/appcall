import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("cal-com connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "cal-com",
      status: "ok",
      source: "connector",
    });
  });
});
