import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { createBatch, createKnowledgebase } from "../src/actions";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);

const agentId = "3c90c3cc-0d44-4b50-8888-8dd25736052a";
const executionId = "4c06b4d1-4096-4561-919a-4f94539c8d4a";
const batchId = "3c90c3cc0d444b5088888dd25736052a";
const ragId = "f265b06a-7fa7-4fbf-8923-55d5ae9c4ba2";
const csv = btoa("contact_number,customer_name\n+919876543210,Asha\n");

describe("bolna compiled HTTP actions", () => {
  test("healthcheck and users.me GET /user/me", async () => {
    for (const key of ["healthcheck", "users.me"] as const) {
      let captured: Request | undefined;
      const result = await actions[key]!({
        apiKey: "fixturekey",
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          captured = new Request(input, init);
          return Response.json({ id: agentId, name: "Bruce Wayne", wallet: 42.42 });
        },
      });
      expect(captured?.method).toBe("GET");
      expect(captured?.url).toBe("https://api.bolna.ai/user/me");
      expect(captured?.headers.get("authorization")).toBe("Bearer fixturekey");
      expect(result).toMatchObject({
        connector: "bolna",
        action: key,
        source: "provider",
        data: { id: agentId, name: "Bruce Wayne", wallet: 42.42 },
      });
    }
  });

  test("agents.list stays GET /v2/agent/all without query", async () => {
    let captured: Request | undefined;
    await actions["agents.list"]!({
      apiKey: "fixturekey",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json([{ id: agentId, agent_name: "Alfred" }]);
      },
    });
    expect(captured?.url).toBe("https://api.bolna.ai/v2/agent/all");
  });

  test("executions.list keeps origin pagination and omits unset filters", async () => {
    let captured: Request | undefined;
    await actions["executions.list"]!({
      apiKey: "fixturekey",
      agent_id: agentId,
      page_number: 1,
      page_size: 1,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ page_number: 1, page_size: 1, total: 0, has_more: false, data: [] });
      },
    });
    const url = new URL(captured!.url);
    expect(url.pathname).toBe(`/v2/agent/${agentId}/executions`);
    expect(url.searchParams.get("page_number")).toBe("1");
    expect(url.searchParams.get("page_size")).toBe("1");
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("from")).toBe(false);
  });

  test("executions.list forwards Composio status and date filters", async () => {
    let captured: Request | undefined;
    await actions["executions.list"]!({
      apiKey: "fixturekey",
      agent_id: agentId,
      status: "completed",
      call_type: "outbound",
      from: "2026-06-07T00:00:00.000Z",
      to: "2026-06-14T00:00:00.000Z",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ data: [] });
      },
    });
    const url = new URL(captured!.url);
    expect(url.searchParams.get("status")).toBe("completed");
    expect(url.searchParams.get("call_type")).toBe("outbound");
    expect(url.searchParams.get("from")).toBe("2026-06-07T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-06-14T00:00:00.000Z");
  });

  test("rejects executions.list page_size above 50 with no network call", async () => {
    let called = false;
    await expect(
      actions["executions.list"]!({
        apiKey: "fixturekey",
        agent_id: agentId,
        page_size: 51,
        fetch: async () => {
          called = true;
          return Response.json({});
        },
      }),
    ).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  test("calls.create posts JSON to /call", async () => {
    let captured: Request | undefined;
    const result = await actions["calls.create"]!({
      apiKey: "fixturekey",
      agent_id: agentId,
      recipient_phone_number: "+919876543210",
      user_data: { customer_name: "Asha" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ message: "done", status: "queued", execution_id: executionId });
      },
    });
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://api.bolna.ai/call");
    expect(captured?.headers.get("content-type")).toBe("application/json");
    expect(await captured!.json()).toEqual({
      agent_id: agentId,
      recipient_phone_number: "+919876543210",
      user_data: { customer_name: "Asha" },
    });
    expect(result).toMatchObject({
      action: "calls.create",
      data: { status: "queued", execution_id: executionId },
    });
  });

  test("agents.create posts agent_config and agent_prompts", async () => {
    let captured: Request | undefined;
    await actions["agents.create"]!({
      apiKey: "fixturekey",
      agent_config: { agent_name: "Alfred", tasks: [] },
      agent_prompts: { task_1: { system_prompt: "Be helpful." } },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ agent_id: agentId, state: "created" }, { status: 201 });
      },
    });
    expect(captured?.method).toBe("POST");
    expect(new URL(captured!.url).pathname).toBe("/v2/agent");
    expect(await captured!.json()).toEqual({
      agent_config: { agent_name: "Alfred", tasks: [] },
      agent_prompts: { task_1: { system_prompt: "Be helpful." } },
    });
  });

  test("phone_numbers.search requires country and sends query params", async () => {
    let captured: Request | undefined;
    await actions["phone_numbers.search"]!({
      apiKey: "fixturekey",
      country: "IN",
      pattern: "987",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json([]);
      },
    });
    const url = new URL(captured!.url);
    expect(url.pathname).toBe("/phone-numbers/search");
    expect(url.searchParams.get("country")).toBe("IN");
    expect(url.searchParams.get("pattern")).toBe("987");
  });

  test("voices.list requires provider_id and model_id", async () => {
    let called = false;
    await expect(
      actions["voices.list"]!({
        apiKey: "fixturekey",
        fetch: async () => {
          called = true;
          return Response.json({ items: [] });
        },
      }),
    ).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);

    let captured: Request | undefined;
    await actions["voices.list"]!({
      apiKey: "fixturekey",
      provider_id: "7a3f4573-7548-5b34-80f9-5edf23bed79b",
      model_id: "f1b5c9cc-72e1-56a4-be8c-f3ee37d38309",
      language: "hi",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ items: [] });
      },
    });
    const url = new URL(captured!.url);
    expect(url.pathname).toBe("/api/v1/voice-config/tts/voices");
    expect(url.searchParams.get("provider_id")).toBe("7a3f4573-7548-5b34-80f9-5edf23bed79b");
    expect(url.searchParams.get("model_id")).toBe("f1b5c9cc-72e1-56a4-be8c-f3ee37d38309");
    expect(url.searchParams.get("language")).toBe("hi");
  });

  test("batches.schedule sends form-urlencoded scheduled_at", async () => {
    let captured: Request | undefined;
    await actions["batches.schedule"]!({
      apiKey: "fixturekey",
      batch_id: batchId,
      scheduled_at: "2026-06-23T18:30:00+00:00",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ message: "success", state: "scheduled" });
      },
    });
    expect(captured?.method).toBe("POST");
    expect(new URL(captured!.url).pathname).toBe(`/batches/${batchId}/schedule`);
    expect(captured?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await captured!.text()).toBe("scheduled_at=2026-06-23T18%3A30%3A00%2B00%3A00");
  });

  test("providers.remove DELETE encodes the provider key", async () => {
    let captured: Request | undefined;
    await actions["providers.remove"]!({
      apiKey: "fixturekey",
      provider_key_name: "OPENAI_API_KEY",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ message: "successful", status: "removed" });
      },
    });
    expect(captured?.method).toBe("DELETE");
    expect(new URL(captured!.url).pathname).toBe("/providers/OPENAI_API_KEY");
  });

  test("inbound.setup posts agent_id and phone_number_id", async () => {
    let captured: Request | undefined;
    await actions["inbound.setup"]!({
      apiKey: "fixturekey",
      agent_id: agentId,
      phone_number_id: "123e4567-e89b-12d3-a456-426614174000",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ phone_number: "+19876543210" });
      },
    });
    expect(new URL(captured!.url).pathname).toBe("/inbound/setup");
    expect(await captured!.json()).toEqual({
      agent_id: agentId,
      phone_number_id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  test("executions.agent.get hits the v1 agent execution path", async () => {
    let captured: Request | undefined;
    await actions["executions.agent.get"]!({
      apiKey: "fixturekey",
      agent_id: agentId,
      execution_id: executionId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ id: executionId, agent_id: agentId, status: "completed" });
      },
    });
    expect(new URL(captured!.url).pathname).toBe(`/agent/${agentId}/execution/${executionId}`);
  });
});

describe("bolna handwritten multipart handlers", () => {
  test("createBatch posts CSV multipart to /batches", async () => {
    let captured: Request | undefined;
    const result = await createBatch({
      apiKey: "fixturekey",
      agent_id: agentId,
      fileName: "recipients.csv",
      contentBase64: csv,
      from_phone_number: "+918035739222",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ batch_id: batchId, state: "created" }, { status: 201 });
      },
    });
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://api.bolna.ai/batches");
    expect(captured?.headers.get("authorization")).toBe("Bearer fixturekey");
    const contentType = captured?.headers.get("content-type") ?? "";
    expect(contentType.startsWith("multipart/form-data")).toBe(true);
    const body = await captured!.formData();
    expect(body.get("agent_id")).toBe(agentId);
    expect(body.get("from_phone_number")).toBe("+918035739222");
    const file = body.get("file");
    expect(file instanceof File || file instanceof Blob).toBe(true);
    expect(result).toMatchObject({
      connector: "bolna",
      action: "batches.create",
      source: "connector",
      data: { batch_id: batchId, state: "created" },
    });
  });

  test("createBatch rejects missing CSV", async () => {
    expect(() => createBatch({ apiKey: "fixturekey", agent_id: agentId })).toThrow(
      expect.objectContaining({ ok: false, code: "INVALID_ACTION_INPUT" }),
    );
  });

  test("createKnowledgebase posts url multipart and rejects file+url", async () => {
    let captured: Request | undefined;
    const result = await createKnowledgebase({
      apiKey: "fixturekey",
      url: "https://example.com/docs",
      chunk_size: 512,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ rag_id: ragId, status: "processing" });
      },
    });
    expect(captured?.url).toBe("https://api.bolna.ai/knowledgebase");
    const body = await captured!.formData();
    expect(body.get("url")).toBe("https://example.com/docs");
    expect(body.get("chunk_size")).toBe("512");
    expect(body.get("file")).toBeNull();
    expect(result).toMatchObject({
      action: "knowledgebases.create",
      data: { rag_id: ragId, status: "processing" },
    });

    expect(() =>
      createKnowledgebase({
        apiKey: "fixturekey",
        url: "https://example.com/docs",
        fileName: "notes.pdf",
        contentBase64: btoa("pdf"),
      }),
    ).toThrow(expect.objectContaining({ ok: false, code: "INVALID_ACTION_INPUT" }));
  });
});
