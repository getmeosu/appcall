import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("healthcheck", () => {
  test("returns connector, status:ok, source:connector", () => {
    const result = healthcheck();
    expect(result.connector).toBe("caldav");
    expect(result.status).toBe("ok");
    expect(result.source).toBe("connector");
  });
});
