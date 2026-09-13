import "../authoring/authoring.test";
import { expect, test } from "bun:test";
import { execFile } from "node:child_process";

test("authoring CLI rejects a missing input file", async () => {
  const result = await new Promise<{ code: number | null }>((resolve) => {
    execFile("bun", ["scripts/connector-gen/openconnector/authoring/cli.ts", "/tmp/does-not-exist-reviewed-input.json"], { cwd: process.cwd() }, (_error, _stdout, _stderr) => resolve({ code: _error?.code as number ?? 1 }));
  });
  expect(result.code).not.toBe(0);
});
