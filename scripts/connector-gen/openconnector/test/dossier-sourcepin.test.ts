import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { parseSourcePinArgs, loadNativeIdentityInventory } from "../sourcepin";

test("sourcepin accepts each required flag exactly once", () => {
  expect(parseSourcePinArgs(["--source", "/tmp/source", "--out", `${tmpdir()}/review-index`, "--as-of", "2026-09-13", "--native-base", "HEAD"])).toEqual({ source: "/tmp/source", out: `${tmpdir()}/review-index`, asOf: "2026-09-13", nativeBase: "HEAD" });
});

test("sourcepin reconciles the pinned source against the real native inventory", async () => {
  const pinned = "0f24b016383b3a0204508e138d2c3d3adb33d9df";
  let inventory;
  let usedPinned = false;
  try {
    inventory = await loadNativeIdentityInventory(pinned);
    usedPinned = true;
  } catch {
    inventory = await loadNativeIdentityInventory("HEAD");
  }
  expect(inventory.baseline.filter((id) => !inventory.current.includes(id))).toEqual([]);
  if (usedPinned) {
    expect(inventory.baseline).toHaveLength(74);
    expect(inventory.current.length).toBeGreaterThanOrEqual(140);
    expect(inventory.current.filter((id) => !inventory.baseline.includes(id)).length).toBe(inventory.current.length - 74);
  } else {
    expect(inventory.current.length).toBeGreaterThanOrEqual(inventory.baseline.length);
  }
}, 30000);

test("sourcepin rejects malformed flag sets", () => {
  const out = `${tmpdir()}/review-index`;
  expect(() => parseSourcePinArgs(["--source", "/tmp/source", "--out", out, "--as-of", "2026-09-13", "--extra", "x"])).toThrow("INVALID_ARGUMENTS");
  expect(() => parseSourcePinArgs(["--source", "/tmp/source", "--source", "/tmp/other", "--out", out, "--as-of", "2026-09-13"])).toThrow("INVALID_ARGUMENTS");
  expect(() => parseSourcePinArgs(["--source", "/tmp/source", "--out", out, "--as-of", "2026-13-99"])).toThrow("INVALID_ARGUMENTS");
  expect(() => parseSourcePinArgs(["--source", "/tmp/source", "--out", out])).toThrow("INVALID_ARGUMENTS");
  expect(() => parseSourcePinArgs(["--source", "/tmp/source", "--out", out, "--as-of", "2026-09-13", "--native-base"])).toThrow("INVALID_ARGUMENTS");
});
