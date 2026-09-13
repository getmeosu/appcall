import { expect, test } from "bun:test";
import { parseSourceDossier } from "../dossier";
import { dossierFromProvider } from "../dossier";

test("provider dossiers require and consume verified pinned blobs", async () => {
  const root = "/tmp/appcall-openconnector-source-33dd4ad6";
  await expect(dossierFromProvider(root, "ably")).rejects.toThrow("MISSING_PINNED_BLOBS");
  const path = "src/providers/ably/actions.ts";
  const trusted = new TextEncoder().encode("export const actions = [{ name: 'trusted', handler: () => request('/trusted') }];");
  const dossier = await dossierFromProvider(root, "ably", { [path]: trusted });
  expect(dossier.files.find((f) => f.path === path)?.sha256).toBe(await import("node:crypto").then(({ createHash }) => createHash("sha256").update(trusted).digest("hex")));
  expect(dossier.actions.some((a) => a.id === "trusted")).toBe(true);
});

test("keeps unresolved helper request syntax unassociated with action declarations", () => {
  const source = `import { fetcher as request } from './transport';\nconst helper = (input: unknown) => request('/v1/me', { headers: { Authorization: token } });\nconst handlers = { getMe: helper };\nexport const actions = [{ name: 'get_me', handler: handlers.getMe }];`;
  const d = parseSourceDossier("checkly", [{ path: "actions.ts", content: source }]);
  expect(d.actions[0]?.id).toBe("get_me");
  expect(d.actions[0]?.nodes).toEqual([]);
  expect(d.actions[0]?.diagnostics.some((x) => x.code === "UNBOUND_REQUEST")).toBe(true);
});

test("does not match commented or string fake fetch calls and reports shadowing", () => {
  const source = `// request('/fake')\nconst text = "request('/fake')";\nfunction run(request: unknown) { return request; }\nexport const actions = [{ name: 'x', handler: run }];`;
  const d = parseSourceDossier("x", [{ path: "actions.ts", content: source }]);
  expect(d.actions[0]?.nodes.some((n) => n.text.includes("/fake"))).toBe(false);
  expect(d.diagnostics.some((x) => x.code === "SHADOWED_BINDING" || x.code === "UNRESOLVED_BINDING")).toBe(true);
});

test("holds unknown syntax and enforces bounded closure", () => {
  const d = parseSourceDossier("x", [{ path: "actions.ts", content: "export const actions = [{ name: foo }];" }], { maxNodes: 1 });
  expect(d.status).toBe("HOLD");
  expect(d.diagnostics.some((x) => ["DYNAMIC_NAME", "NODE_LIMIT"].includes(x.code))).toBe(true);
});

test("never labels an unresolved handler as bound and rejects unsafe provider ids", async () => {
  const d = parseSourceDossier("x", [{ path: "actions.ts", content: "export const actions = [{ name: 'x', handler: missing }];" }]);
  expect(d.actions[0]?.diagnostics.some(x => x.code === "UNRESOLVED_BINDING")).toBe(true);
  await expect(import("../dossier").then(m => m.dossierFromProvider("/tmp/appcall-openconnector-source-33dd4ad6", "../escape"))).rejects.toThrow("UNSAFE_PROVIDER_ID");
});
