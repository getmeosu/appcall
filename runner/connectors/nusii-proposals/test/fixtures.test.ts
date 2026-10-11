import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
  response: { status: number; headers?: Record<string, string>; bodyFile: string };
};
type CaseFile = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
};

const root = dirname(fileURLToPath(import.meta.url));
const caseDir = join(root, "../fixtures/cases");
const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, { kind?: string }>;

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

describe("nusii-proposals fixtures", () => {
  const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
  const cases: CaseFile[] = files.map((name) => Bun.file(join(caseDir, name)).json() as unknown as CaseFile);

  test("covers every declared action with a positive fixture", async () => {
    const loaded = await Promise.all(cases);
    const positive = new Set(loaded.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual(Object.keys(operations).sort());
  });

  test("replays authenticated fixture cases", async () => {
    const loaded = await Promise.all(cases);
    for (const c of loaded) {
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = c.exchanges[index++];
        expect(expected, `${c.id} extra request`).toBeTruthy();
        const req = new Request(input, init);
        expect(req.method).toBe(expected.request.method);
        expect(sameUrl(req.url, expected.request.url), `${c.id} ${req.url} != ${expected.request.url}`).toBe(true);
        const body = init?.body == null ? null : String(init.body);
        expect(body).toBe(expected.request.body);
        const got = new Headers(init?.headers);
        const want = new Headers(expected.request.headers ?? {});
        for (const [key, value] of want) expect(got.get(key), `${c.id} header ${key}`).toBe(value);
        for (const [key] of got) {
          if (key === "content-length") continue;
          expect(want.has(key), `${c.id} unexpected header ${key}`).toBe(true);
        }
        const raw = await Bun.file(join(caseDir, expected.response.bodyFile)).arrayBuffer();
        return new Response(raw, { status: expected.response.status, headers: expected.response.headers });
      };
      const action = actions[c.operation];
      expect(action, c.operation).toBeTypeOf("function");
      const pending = action!({ ...c.input, ...c.credentials, fetch: fetchStub });
      if (c.expected.kind === "error") {
        await expect(pending).rejects.toMatchObject({ code: c.expected.code });
        continue;
      }
      const result = await pending;
      const expected = await Bun.file(join(caseDir, c.expected.resultFile)).json();
      expect(result, c.id).toEqual(expected);
      expect(index, c.id).toBe(c.exchanges.length);
    }
  });
});
