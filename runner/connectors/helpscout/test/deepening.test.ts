import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/deepen_cases.json";
import embeddedFixture from "../fixtures/embedded.json";
import itemFixture from "../fixtures/item.json";
import reportFixture from "../fixtures/report.json";
import savedRepliesFixture from "../fixtures/saved_replies.json";
import attachmentDataFixture from "../fixtures/attachment_data.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const original = [
  "healthcheck", "inboxes.list", "users.list", "users.me", "users.get", "tags.list",
  "conversations.list", "conversations.get", "threads.list", "customers.list", "customers.get",
  "mailboxes.list", "mailboxes.get", "customers.create", "customers.update",
  "conversations.create", "conversations.update", "threads.create", "threads.notes.create",
];

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_m, name: string) => encodeURIComponent(String(input[name])));
}

describe("Help Scout Composio tools compile to real Mailbox API calls", () => {
  test("original operations remain registered", () => {
    for (const key of original) expect(actions[key], key).toBeTypeOf("function");
  });

  test("every added operation is a compiled HTTP handler", () => {
    for (const entry of cases as Array<{ key: string }>) {
      expect(actions[entry.key], entry.key).toBeTypeOf("function");
    }
  });

  for (const entry of cases as Array<{
    key: string;
    method: string;
    path: string;
    success: number[];
    kind: string;
    embedded?: string;
    input: Record<string, unknown>;
  }>) {
    test(`${entry.key} ${entry.method} ${entry.path}`, async () => {
      const seen: Request[] = [];
      const status = entry.success[0] ?? 200;
      const result = await actions[entry.key]!({
        accessToken: "tok",
        ...entry.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          if (status === 204) return new Response(null, { status });
          if (status === 201) return new Response(null, { status, headers: { "Resource-ID": "99", Location: "https://api.helpscout.net/v2/resource/99" } });
          if (entry.kind === "collection") {
            const body = { _embedded: { [entry.embedded ?? "items"]: [{ id: 1 }] }, page: embeddedFixture.page };
            return new Response(JSON.stringify(body), { status: 200 });
          }
          if (entry.kind === "raw_array") return new Response(JSON.stringify(savedRepliesFixture), { status: 200 });
          if (entry.kind === "report") return new Response(JSON.stringify(reportFixture), { status: 200 });
          if (entry.key.includes("attachments.data")) return new Response(JSON.stringify(attachmentDataFixture), { status: 200 });
          return new Response(JSON.stringify(itemFixture), { status: 200 });
        },
      });
      expect(seen).toHaveLength(1);
      const url = new URL(seen[0].url);
      expect(url.pathname).toBe(`/v2${renderPath(entry.path, entry.input)}`);
      expect(seen[0].method).toBe(entry.method);
      expect(seen[0].headers.get("authorization")).toBe("Bearer tok");
      expect(result).toBeTruthy();
    });
  }
});
