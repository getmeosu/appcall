import { describe, expect, test } from "bun:test";
import formGetFixture from "../fixtures/form_get.json";
import formCreateFixture from "../fixtures/form_create.json";
import formsListFixture from "../fixtures/forms_list.json";
import webhookCreateFixture from "../fixtures/webhook_create.json";
import webhooksListFixture from "../fixtures/webhooks_list.json";
import responsesListFixture from "../fixtures/responses_list.json";
import {
  listForms,
  getForm,
  createForm,
  updateForm,
  deleteForm,
  listResponses,
  deleteResponses,
  createWebhook,
  listWebhooks,
} from "../src/actions";

// ─── forms.list ───────────────────────────────────────────────────────────────

describe("listForms", () => {
  test("validates input without accessToken", () => {
    const result = listForms({ page: 1, pageSize: 10 });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "forms.list",
      source: "connector",
      validated: { page: 1, pageSize: 10 },
    });
  });

  test("calls GET /forms with correct URL and Authorization header", async () => {
    const requests: Request[] = [];
    const result = await listForms({
      accessToken: "tf-token-abc",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(formsListFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    expect(result).toMatchObject({ connector: "typeform", action: "forms.list", source: "connector" });
    expect(Array.isArray((result as Record<string, unknown>).forms)).toBe(true);
  });

  test("passes search query param", async () => {
    const requests: Request[] = [];
    await listForms({
      accessToken: "tf-token-abc",
      search: "customer",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(formsListFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toContain("search=customer");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listForms({
      accessToken: "tf-token-abc",
      fetch: async () => new Response(JSON.stringify({ code: "RATE_LIMIT" }), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 }));
  });
});

// ─── forms.get ────────────────────────────────────────────────────────────────

describe("getForm", () => {
  test("validates input without accessToken", () => {
    const result = getForm({ formId: "abc123" });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "forms.get",
      source: "connector",
      validated: { formId: "abc123" },
    });
  });

  test("throws if formId is missing", () => {
    expect(() => getForm({})).toThrow("formId is required");
  });

  test("calls GET /forms/{id} with correct URL and Authorization header", async () => {
    const requests: Request[] = [];
    const result = await getForm({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(formGetFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms/abc123");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.connector).toBe("typeform");
    expect(r.action).toBe("forms.get");
    expect(r.form).toBeDefined();
    const form = r.form as Record<string, unknown>;
    expect(form.providerFormId).toBe("abc123");
    expect(form.fieldCount).toBe(2);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getForm({
      accessToken: "tf-token-abc",
      formId: "notexist",
      fetch: async () => new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." }));
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getForm({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "20" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 }));
  });
});

// ─── forms.create ─────────────────────────────────────────────────────────────

describe("createForm", () => {
  test("validates input without accessToken", () => {
    const result = createForm({ title: "New Form" });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "forms.create",
      source: "connector",
      validated: { title: "New Form" },
    });
  });

  test("throws if title is missing", () => {
    expect(() => createForm({})).toThrow("title is required");
  });

  test("calls POST /forms with correct URL, method, Authorization header", async () => {
    const requests: Request[] = [];
    const result = await createForm({
      accessToken: "tf-token-abc",
      title: "New Product Feedback",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(formCreateFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("forms.create");
    expect(r.form).toBeDefined();
    const form = r.form as Record<string, unknown>;
    expect(form.providerFormId).toBe("newform789");
  });

  test("sends body with title", async () => {
    const requests: Request[] = [];
    await createForm({
      accessToken: "tf-token-abc",
      title: "Test Form",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(formCreateFixture), { status: 200 });
      },
    });

    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.title).toBe("Test Form");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createForm({
      accessToken: "tf-token-abc",
      title: "Test",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "10" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED" }));
  });
});

// ─── forms.update ─────────────────────────────────────────────────────────────

describe("updateForm", () => {
  test("validates input without accessToken", () => {
    const result = updateForm({ formId: "abc123", title: "Updated Title" });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "forms.update",
      source: "connector",
      validated: { formId: "abc123", title: "Updated Title" },
    });
  });

  test("throws if formId is missing", () => {
    expect(() => updateForm({ title: "Test" })).toThrow("formId is required");
  });

  test("calls PUT /forms/{id} with correct method and Authorization", async () => {
    const requests: Request[] = [];
    const result = await updateForm({
      accessToken: "tf-token-abc",
      formId: "abc123",
      title: "Updated Survey",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(formGetFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms/abc123");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("forms.update");
    expect(r.form).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateForm({
      accessToken: "tf-token-abc",
      formId: "missing",
      title: "Test",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_UPSTREAM_ERROR" }));
  });
});

// ─── forms.delete ─────────────────────────────────────────────────────────────

describe("deleteForm", () => {
  test("validates input without accessToken", () => {
    const result = deleteForm({ formId: "abc123" });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "forms.delete",
      source: "connector",
      validated: { formId: "abc123" },
    });
  });

  test("calls DELETE /forms/{id} with correct method and Authorization", async () => {
    const requests: Request[] = [];
    const result = await deleteForm({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response("", { status: 204 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms/abc123");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("forms.delete");
    expect(r.deleted).toBe(true);
    expect(r.formId).toBe("abc123");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteForm({
      accessToken: "tf-token-abc",
      formId: "notexist",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." }));
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteForm({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "60" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 }));
  });
});

// ─── responses.list (action) ──────────────────────────────────────────────────

describe("listResponses", () => {
  test("validates input without accessToken", () => {
    const result = listResponses({ formId: "abc123", pageSize: 50 });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "responses.list",
      source: "connector",
      validated: { formId: "abc123", pageSize: 50 },
    });
  });

  test("throws if formId is missing", () => {
    expect(() => listResponses({})).toThrow("formId is required");
  });

  test("calls GET /forms/{id}/responses with correct URL and Authorization", async () => {
    const requests: Request[] = [];
    const result = await listResponses({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(responsesListFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms/abc123/responses");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("responses.list");
    expect(Array.isArray(r.responses)).toBe(true);
  });

  test("passes query params for since/until", async () => {
    const requests: Request[] = [];
    await listResponses({
      accessToken: "tf-token-abc",
      formId: "abc123",
      since: "2025-01-01T00:00:00Z",
      until: "2025-12-31T23:59:59Z",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(responsesListFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toContain("since=2025-01-01");
    expect(requests[0].url).toContain("until=2025-12-31");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listResponses({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "15" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 }));
  });
});

// ─── responses.delete ─────────────────────────────────────────────────────────

describe("deleteResponses", () => {
  test("validates input without accessToken", () => {
    const result = deleteResponses({ formId: "abc123", includedTokens: ["tok1", "tok2"] });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "responses.delete",
      source: "connector",
      validated: { formId: "abc123", includedTokens: ["tok1", "tok2"] },
    });
  });

  test("throws if includedTokens is empty", () => {
    expect(() => deleteResponses({ formId: "abc123", includedTokens: [] })).toThrow("non-empty array");
  });

  test("calls DELETE /forms/{id}/responses with tokens in query string", async () => {
    const requests: Request[] = [];
    const result = await deleteResponses({
      accessToken: "tf-token-abc",
      formId: "abc123",
      includedTokens: ["tok_a", "tok_b"],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response("", { status: 204 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://api.typeform.com/forms/abc123/responses");
    expect(requests[0].url).toContain("included_tokens=tok_a");
    expect(requests[0].url).toContain("included_tokens=tok_b");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.deleted).toBe(true);
    expect(r.formId).toBe("abc123");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteResponses({
      accessToken: "tf-token-abc",
      formId: "abc123",
      includedTokens: ["tok1"],
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "5" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED" }));
  });
});

// ─── webhooks.create ──────────────────────────────────────────────────────────

describe("createWebhook", () => {
  test("validates input without accessToken", () => {
    const result = createWebhook({ formId: "abc123", tag: "my-hook", url: "https://example.com/wh" });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "webhooks.create",
      source: "connector",
      validated: { formId: "abc123", tag: "my-hook", url: "https://example.com/wh" },
    });
  });

  test("throws if url is missing", () => {
    expect(() => createWebhook({ formId: "abc123", tag: "my-hook" })).toThrow("url is required");
  });

  test("calls PUT /forms/{id}/webhooks/{tag} with correct URL, method, Authorization", async () => {
    const requests: Request[] = [];
    const result = await createWebhook({
      accessToken: "tf-token-abc",
      formId: "abc123",
      tag: "my-webhook",
      url: "https://example.com/webhook",
      enabled: true,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(webhookCreateFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms/abc123/webhooks/my-webhook");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("webhooks.create");
    expect(r.webhook).toBeDefined();
    const wh = r.webhook as Record<string, unknown>;
    expect(wh.tag).toBe("my-webhook");
    expect(wh.enabled).toBe(true);
  });

  test("sends body with url", async () => {
    const requests: Request[] = [];
    await createWebhook({
      accessToken: "tf-token-abc",
      formId: "abc123",
      tag: "my-hook",
      url: "https://example.com/hook",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(webhookCreateFixture), { status: 200 });
      },
    });

    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.url).toBe("https://example.com/hook");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createWebhook({
      accessToken: "tf-token-abc",
      formId: "notexist",
      tag: "hook",
      url: "https://example.com",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_UPSTREAM_ERROR" }));
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createWebhook({
      accessToken: "tf-token-abc",
      formId: "abc123",
      tag: "hook",
      url: "https://example.com",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "25" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 }));
  });
});

// ─── webhooks.list ────────────────────────────────────────────────────────────

describe("listWebhooks", () => {
  test("validates input without accessToken", () => {
    const result = listWebhooks({ formId: "abc123" });
    expect(result).toMatchObject({
      connector: "typeform",
      action: "webhooks.list",
      source: "connector",
      validated: { formId: "abc123" },
    });
  });

  test("throws if formId is missing", () => {
    expect(() => listWebhooks({})).toThrow("formId is required");
  });

  test("calls GET /forms/{id}/webhooks with correct URL and Authorization", async () => {
    const requests: Request[] = [];
    const result = await listWebhooks({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(webhooksListFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.typeform.com/forms/abc123/webhooks");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tf-token-abc");
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("webhooks.list");
    const webhooks = r.webhooks as Record<string, unknown>[];
    expect(Array.isArray(webhooks)).toBe(true);
    expect(webhooks).toHaveLength(2);
    expect(webhooks[0].tag).toBe("my-webhook");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listWebhooks({
      accessToken: "tf-token-abc",
      formId: "notexist",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_UPSTREAM_ERROR" }));
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listWebhooks({
      accessToken: "tf-token-abc",
      formId: "abc123",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
    })).rejects.toEqual(expect.objectContaining({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 }));
  });
});
