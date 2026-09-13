import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintRuntime, fingerprintRuntimeAt } from "../runtime-fingerprint";

describe("runtime fingerprint", () => {
  test("is deterministic and changes when a byte changes", async () => {
    const d = await mkdtemp(join(tmpdir(), "appcall-runtime-")); await writeFile(join(d, "b.ts"), "b"); await writeFile(join(d, "a.ts"), "a");
    const first = await fingerprintRuntimeAt(d); const second = await fingerprintRuntimeAt(d); expect(second).toEqual(first);
    await writeFile(join(d, "a.ts"), "changed"); expect((await fingerprintRuntimeAt(d)).aggregateHash).not.toBe(first.aggregateHash);
  });
  test("rejects symlinked runtime files", async () => { const d = await mkdtemp(join(tmpdir(), "appcall-runtime-")); await writeFile(join(d, "real.ts"), "x"); await symlink(join(d, "real.ts"), join(d, "link.ts")); expect(fingerprintRuntimeAt(d)).rejects.toThrow("RUNTIME_SYMLINK"); });
});
test("fingerprints the actual declarative runtime", async () => { const result = await fingerprintRuntime(); expect(result.files["declarative/compile.ts"]).toMatch(/^[a-f0-9]{64}$/); });
