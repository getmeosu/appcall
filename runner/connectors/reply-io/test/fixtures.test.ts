import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { actions } from "../src/actions";
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
const compiled = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, { kind?: string }>;

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) =>
    [...u.searchParams.entries()].sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

describe("reply-io fixtures", () => {
  const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
  const cases: CaseFile[] = files.map((name) => Bun.file(join(caseDir, name)).json() as unknown as CaseFile);

  test("covers every declared action with a positive fixture", async () => {
    const loaded = await Promise.all(cases);
    const positive = new Set(
      loaded.filter((item) => item.expected.kind === "success").map((item) => item.operation),
    );
    expect([...positive].sort()).toEqual(Object.keys(operations).sort());
  });

  test("replays authenticated fixture cases", async () => {
    const loaded = await Promise.all(cases);
    for (const item of loaded) {
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = item.exchanges[index++];
        expect(expected, `${item.id} extra request`).toBeTruthy();
        const req = new Request(input, init);
        expect(req.method).toBe(expected.request.method);
        expect(sameUrl(req.url, expected.request.url), `${item.id} ${req.url} != ${expected.request.url}`).toBe(true);
        const body = init?.body == null ? null : String(init.body);
        expect(body).toBe(expected.request.body);
        const got = new Headers(init?.headers);
        const want = new Headers(expected.request.headers ?? {});
        for (const [key, value] of want) expect(got.get(key), `${item.id} header ${key}`).toBe(value);
        for (const [key] of got) {
          if (key === "content-length") continue;
          expect(want.has(key), `${item.id} unexpected header ${key}`).toBe(true);
        }
        const raw = await Bun.file(join(caseDir, expected.response.bodyFile)).arrayBuffer();
        return new Response(raw, { status: expected.response.status, headers: expected.response.headers });
      };
      const action = actions[item.operation as keyof typeof actions] ?? compiled.actions[item.operation];
      expect(action, item.operation).toBeTypeOf("function");
      const pending = action!({ ...item.input, ...item.credentials, fetch: fetchStub });
      if (item.expected.kind === "error") {
        await expect(pending).rejects.toMatchObject({ code: item.expected.code });
        continue;
      }
      const result = await pending;
      const expected = await Bun.file(join(caseDir, item.expected.resultFile)).json();
      expect(result, item.id).toEqual(expected);
      expect(index, item.id).toBe(item.exchanges.length);
    }
  });
});
