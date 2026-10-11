import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { COMPOSIO_TOOLS } from "./manifest.test";

const { actions } = compileDeclarativeConnector(manifest as never);
const mock = (body: unknown, status = 200, contentType = "application/json") => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
    calls.push({ url: String(u), init: i });
    const payload =
      status === 204
        ? null
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    return new Response(payload, {
      status,
      headers: { "Content-Type": contentType },
    });
  };
  return { calls, fetch };
};

describe("mailtrap declarative connector", () => {
  it("compiles every Composio tool plus origin inventory", () => {
    expect(Object.keys(actions).length).toBe(53);
    expect(actions.healthcheck).toBeDefined();
    expect(actions["accounts.list"]).toBeDefined();
    expect(actions["sandboxes.list"]).toBeDefined();
    for (const key of Object.values(COMPOSIO_TOOLS)) {
      expect(actions[key], key).toBeTypeOf("function");
    }
  });

  it("lists accounts with bearer auth", async () => {
    const m = mock([{ id: 26730, name: "James" }]);
    const r = (await actions["accounts.list"]!({ apiKey: "secret", fetch: m.fetch })) as { data: unknown };
    expect(m.calls[0]?.url).toBe("https://mailtrap.io/api/accounts");
    expect((m.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(r.data).toEqual([{ id: 26730, name: "James" }]);
  });

  it("encodes contact emails in the path", async () => {
    const m = mock({ data: { id: "c1", email: "ada@example.com" } });
    await actions["contacts.get"]!({
      apiKey: "x",
      account_id: 26730,
      contact_identifier: "ada@example.com",
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://mailtrap.io/api/accounts/26730/contacts/ada%40example.com");
  });

  it("creates a contact with the nested Mailtrap body", async () => {
    const m = mock({ data: { id: "c1", email: "ada@example.com" } }, 201);
    const r = (await actions["contacts.create"]!({
      apiKey: "x",
      account_id: 26730,
      contact: { email: "ada@example.com", list_ids: [1] },
      fetch: m.fetch,
    })) as { data: unknown };
    expect(m.calls[0]?.url).toBe("https://mailtrap.io/api/accounts/26730/contacts");
    expect(m.calls[0]?.init?.method).toBe("POST");
    expect(String(m.calls[0]?.init?.body)).toBe(
      '{"contact":{"email":"ada@example.com","list_ids":[1]}}',
    );
    expect(r.data).toEqual({ data: { id: "c1", email: "ada@example.com" } });
  });

  it("appends sending-stats array filters", async () => {
    const m = mock({ delivery_count: 12 });
    await actions["sending-stats.get"]!({
      apiKey: "x",
      account_id: 26730,
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      sending_domain_ids: [435],
      sending_streams: ["transactional"],
      categories: ["Onboarding"],
      email_service_providers: ["Google"],
      fetch: m.fetch,
    });
    const url = new URL(m.calls[0]!.url);
    expect(url.pathname).toBe("/api/accounts/26730/stats");
    expect(url.searchParams.get("start_date")).toBe("2026-01-01");
    expect(url.searchParams.get("end_date")).toBe("2026-01-31");
    expect(url.searchParams.getAll("sending_domain_ids[]")).toEqual(["435"]);
    expect(url.searchParams.getAll("sending_streams[]")).toEqual(["transactional"]);
    expect(url.searchParams.getAll("categories[]")).toEqual(["Onboarding"]);
    expect(url.searchParams.getAll("email_service_providers[]")).toEqual(["Google"]);
  });

  it("reads message HTML as text", async () => {
    const m = mock("<html><body>Hi</body></html>", 200, "text/html");
    const r = (await actions["messages.html.get"]!({
      apiKey: "x",
      account_id: 26730,
      inbox_id: 2564102,
      message_id: 42,
      fetch: m.fetch,
    })) as { data: unknown };
    expect(m.calls[0]?.url).toBe(
      "https://mailtrap.io/api/accounts/26730/inboxes/2564102/messages/42/body.html",
    );
    expect((m.calls[0]?.init?.headers as Record<string, string>).Accept).toBe("text/html");
    expect(r.data).toBe("<html><body>Hi</body></html>");
  });

  it("deletes projects with 204", async () => {
    const m = mock(null, 204);
    const r = (await actions["projects.delete"]!({
      apiKey: "x",
      account_id: 26730,
      project_id: 2550469,
      fetch: m.fetch,
    })) as { success: boolean };
    expect(m.calls[0]?.url).toBe("https://mailtrap.io/api/accounts/26730/projects/2550469");
    expect(m.calls[0]?.init?.method).toBe("DELETE");
    expect(r.success).toBe(true);
  });

  it("rejects unknown fields and missing path ids", async () => {
    await expect(
      actions["contacts.get"]!({ apiKey: "x", account_id: 1, contact_identifier: "a", unknownField: "nope" }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["inboxes.get"]!({ apiKey: "x", account_id: 1, fetch: mock({}).fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});
