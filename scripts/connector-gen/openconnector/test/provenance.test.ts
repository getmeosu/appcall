import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256, verifyPinnedFiles, verifyRecordedFiles } from "../provenance";
test("hashes deterministically", () => expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));

async function repo(file = "LICENSE.txt") {
  const root = await mkdtemp(join(tmpdir(), "prov-"));
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", root, ...args]);
  run(["init", "-q"]); await mkdir(join(root, file, ".."), { recursive: true }); await writeFile(join(root, file), "raw\n"); run(["add", "."]); run(["-c", "user.email=x@y", "-c", "user.name=x", "commit", "-qm", "x"]);
  const commit = new TextDecoder().decode(run(["rev-parse", "HEAD"]).stdout).trim();
  const treeOid = new TextDecoder().decode(run(["rev-parse", `${commit}^{tree}`]).stdout).trim();
  return { root, commit, treeOid, files: { [file]: sha256(await readFile(join(root, file))) } };
}
test("rejects foreign repository and unpinned temporary HEAD", async () => {
  const r = await repo();
  await expect(verifyPinnedFiles(r.root, { repo: "https://github.com/evil/repo.git", commit: r.commit, files: r.files })).rejects.toThrow("repository");
  await expect(verifyPinnedFiles(r.root, { repo: "https://github.com/oomol-lab/open-connector.git", commit: r.commit, files: r.files })).rejects.toThrow("commit");
}, { timeout: 20_000 });
test("rejects traversal, symlink ancestors, and changed bytes", async () => {
  const r = await repo("nested/LICENSE.txt");
  await expect(verifyPinnedFiles(r.root, { repo: "https://github.com/oomol-lab/open-connector.git", commit: r.commit, files: { "../LICENSE.txt": r.files["nested/LICENSE.txt"] } })).rejects.toThrow("UNSAFE_SOURCE_PATH");
  await mkdir(join(r.root, "alias")); await symlink(join(r.root, "nested"), join(r.root, "alias", "up"));
  await expect(verifyPinnedFiles(r.root, { repo: "https://github.com/oomol-lab/open-connector.git", commit: r.commit, files: { "alias/up/LICENSE.txt": r.files["nested/LICENSE.txt"] } })).rejects.toThrow("commit");
  await writeFile(join(r.root, "nested/LICENSE.txt"), "tampered");
  await expect(verifyRecordedFiles(r.root, r.files, async () => new TextEncoder().encode("raw\n"))).rejects.toThrow("HASH_MISMATCH");
}, { timeout: 20_000 });
test("checks local and committed raw bytes including trailing newline", async () => {
  const root = await mkdtemp(join(tmpdir(), "prov-bytes-"));
  await mkdir(join(root, "dir")); await writeFile(join(root, "dir", "NOTICE.md"), "notice\n");
  const files = { "dir/NOTICE.md": sha256("notice\n") };
  const ok = await verifyRecordedFiles(root, files, async () => new TextEncoder().encode("notice\n"));
  expect(new TextDecoder().decode(ok["dir/NOTICE.md"])).toBe("notice\n");
  await expect(verifyRecordedFiles(root, files, async () => new TextEncoder().encode("notice"))).rejects.toThrow("COMMITTED_HASH_MISMATCH");
}, { timeout: 20_000 });
test("verifies the reviewed snapshot when explicitly available", async () => {
  const source = process.env.APPCALL_OPENCONNECTOR_SOURCE;
  if (!source) return;
  const manifest = await Bun.file(new URL("../provenance.json", import.meta.url)).json();
  const files: Record<string, string> = {};
  for (const record of manifest.records) for (const file of record.files) files[file.path] = file.sha256;
  // The manifest records the vendored destination names; the upstream snapshot
  // keeps these files at its repository root.
  files["LICENSE.txt"] = manifest.source.licenseSha256;
  files["NOTICE.md"] = manifest.source.noticeSha256;
  const verified = await verifyPinnedFiles(source, { repo: manifest.source.repo, commit: manifest.source.commit, treeOid: manifest.source.treeOid, files });
  expect(Object.keys(verified).length).toBeGreaterThan(8);
}, { timeout: 20_000 });
