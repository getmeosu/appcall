import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
const entry = new URL("../index.ts", import.meta.url).pathname;
async function run(args: string[]) {
  const proc = Bun.spawn(["bun", entry, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}
test("--help is deterministic and side effect free", async () => { const result = await run(["--help"]); expect(result.code).toBe(0); expect(result.stdout).toContain("usage:"); expect(result.stderr).toBe(""); });
test("unknown providers are held with a structured safe error", async () => { const result = await run(["--provider", "definitely-unknown-provider", "--source", "/tmp/no-such-snapshot"]); expect(result.code).not.toBe(0); expect(`${result.stdout}${result.stderr}`).toContain("UNKNOWN_PROVIDER"); expect(`${result.stdout}${result.stderr}`).not.toContain("password"); });
test("invalid, duplicate and missing flags fail before filesystem work", async () => {
  for (const args of [["--bogus"], ["--provider", "coda", "--provider", "helpscout", "--source", "/tmp/x"]]) {
    const result = await run(args); expect(result.code).not.toBe(0); expect(`${result.stdout}${result.stderr}`).toContain("INVALID_ARGUMENTS");
  }
  const missing = await run(["--provider", "coda"]); expect(missing.code).not.toBe(0); expect(`${missing.stdout}${missing.stderr}`).toContain("usage:");
});
test("rejects positional arguments and missing output values", async () => {
  const positional = await run(["--provider", "coda", "--source", "/tmp/x", "extra"]); expect(positional.code).not.toBe(0); expect(`${positional.stdout}${positional.stderr}`).toContain("INVALID_ARGUMENTS");
  const missingOut = await run(["--provider", "coda", "--source", "/tmp/no-such-snapshot", "--out"]); expect(missingOut.code).not.toBe(0); expect(`${missingOut.stdout}${missingOut.stderr}`).toContain("INVALID_ARGUMENTS");
});

const source = process.env.APPCALL_OPENCONNECTOR_SOURCE;
const approved = (await Bun.file(new URL("../selection.json", import.meta.url)).json()).entries.filter((entry: any) => entry.disposition === "APPROVED");
for (const entry of approved) test.skipIf(!source)(`successful pinned ${entry.providerId} import equals checked manifest`, async () => {
  const provider = entry.providerId;
  const installedId = entry.appcallId;
  const first = `/tmp/appcall-import-test-${process.pid}-${Date.now()}`;
  try { const result = await run(["--provider", provider, "--source", source!, "--out", first]);
    expect(result.code).toBe(0); const emitted = JSON.parse(result.stdout); expect(emitted.holds).toEqual([]);
    const manifest = await Bun.file(`${first}/manifest.json`).json(); const checked = await Bun.file(`runner/connectors/${installedId}/manifest.json`).json(); expect(manifest).toEqual(checked); expect(emitted.manifest).toEqual(checked);
    const second = await run(["--provider", provider, "--source", source!, "--out", first]); expect(second.code).not.toBe(0); expect(`${second.stdout}${second.stderr}`).toContain("EEXIST");
  } finally { await rm(first, { recursive: true, force: true }); }
});

test("uses the AppCall id for installed manifest paths", async () => {
  const capsule = approved.find((entry: any) => entry.providerId === "capsule_crm");
  if (!capsule) return;
  expect(capsule.appcallId).toBe("capsule-crm");
  expect(await Bun.file("runner/connectors/capsule-crm/manifest.json").exists()).toBe(true);
});

test.skipIf(!source)("rejects output paths outside the dedicated /tmp namespace", async () => {
  const result = await run(["--provider", "coda", "--source", source!, "--out", "/private/tmp/appcall-import-outside"]);
  expect(result.code).not.toBe(0); expect(`${result.stdout}${result.stderr}`).toContain("UNSAFE_OUTPUT");
});
