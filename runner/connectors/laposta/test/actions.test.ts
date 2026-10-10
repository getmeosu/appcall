import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { appendFormValue, handwritten } from "../src/actions";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, ...handwritten };

const mock = (body: unknown, status = 200) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
    calls.push({ url: String(u), init: i });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetch };
};

describe("laposta actions", () => {
  it("compiles every HTTP action including healthcheck", () => {
    expect(Object.keys(compiled.actions).length).toBe(26);
    expect(actions.healthcheck).toBeDefined();
    expect(actions["members.create"]).toBeDefined();
    expect(actions["fields.create"]).toBeDefined();
    expect(actions["fields.update"]).toBeDefined();
    expect(actions["webhooks.create"]).toBeDefined();
  });

  it("healthchecks with basic auth and wraps data", async () => {
    const m = mock({ data: [] });
    const r = (await actions.healthcheck!({ apiKey: "secret", fetch: m.fetch })) as { data: unknown };
    expect(m.calls[0]?.url).toBe("https://api.laposta.org/v2/list");
    expect((m.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("secret:", "utf8").toString("base64")}`,
    );
    expect(r.data).toEqual({ data: [] });
  });

  it("flattens member custom_fields and options onto form keys", async () => {
    const m = mock({ member: { member_id: "9978ydioiZ" } });
    await actions["members.create"]!({
      apiKey: "x",
      list_id: "BaImMu3JZA",
      ip: "198.51.100.0",
      email: "maartje@example.net",
      custom_fields: { name: "Maartje de Vries", labels: ["Customer", "VIP"] },
      options: { upsert: true, ignore_doubleoptin: false },
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://api.laposta.org/v2/member");
    expect(m.calls[0]?.init?.method).toBe("POST");
    const body = String(m.calls[0]?.init?.body);
    expect(body).toContain("list_id=BaImMu3JZA");
    expect(body).toContain("custom_fields%5Bname%5D=Maartje+de+Vries");
    expect(body).toContain("custom_fields%5Blabels%5D%5B%5D=Customer");
    expect(body).toContain("custom_fields%5Blabels%5D%5B%5D=VIP");
    expect(body).toContain("options%5Bupsert%5D=true");
    expect(body).toContain("options%5Bignore_doubleoptin%5D=false");
  });

  it("flattens field options onto options[] form keys", async () => {
    const m = mock({ field: { field_id: "GeVKetES6z" } });
    await actions["fields.create"]!({
      apiKey: "x",
      list_id: "BaImMu3JZA",
      name: "Color",
      datatype: "select_single",
      options: ["Red", "Green", "Blue"],
      required: true,
      in_form: true,
      in_list: true,
      fetch: m.fetch,
    });
    const body = String(m.calls[0]?.init?.body);
    expect(body).toContain("options%5B%5D=Red");
    expect(body).toContain("options%5B%5D=Green");
    expect(body).toContain("options%5B%5D=Blue");
    expect(body).toContain("required=true");
  });

  it("sends fields.update as JSON including options_full", async () => {
    const m = mock({ field: { field_id: "GeVKetES6z" } });
    await actions["fields.update"]!({
      apiKey: "x",
      list_id: "BaImMu3JZA",
      field_id: "GeVKetES6z",
      required: false,
      options_full: [{ id: "1", value: "Red" }],
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://api.laposta.org/v2/field/GeVKetES6z");
    expect(JSON.parse(String(m.calls[0]?.init?.body))).toEqual({
      list_id: "BaImMu3JZA",
      options_full: [{ id: "1", value: "Red" }],
      required: false,
    });
    expect((m.calls[0]?.init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("matches URLSearchParams encoding used by fixtures", () => {
    const form = new URLSearchParams();
    appendFormValue(form, "custom_fields", { name: "Maartje de Vries", children: 3 });
    expect(form.toString()).toBe("custom_fields%5Bname%5D=Maartje+de+Vries&custom_fields%5Bchildren%5D=3");
  });
});
