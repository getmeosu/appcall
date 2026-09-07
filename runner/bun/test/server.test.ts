import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { handleRPC } from "../src/server";
import { supportedProtocolVersion } from "../src/protocol";
import { healthcheck as brevoHealthcheck } from "../../connectors/brevo/src/healthcheck";

afterEach(() => {
  console.info.mockRestore?.();
});

describe("runner protocol", () => {
  test("runner.describe returns protocol version", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({ id: "req_runner", method: "runner.describe" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("req_runner");
    expect(body.ok).toBe(true);
    expect(body.result.protocolVersion).toBe(supportedProtocolVersion);
    expect(body.result.runner).toBe("appcall-bun");
  });

  test("connector.describe returns fake connector metadata", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.describe",
          params: { connectorKey: "fake" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.key).toBe("fake");
    expect(Object.keys(body.result.operations)).toContain("healthcheck");
  });

  test("connector.describe returns Notion, Slack, Telegram, and WhatsApp metadata", async () => {
    const expectedAuth: Record<string, string> = {
      notion: "api_key",
      slack: "oauth2",
      telegram: "api_key",
      whatsapp: "api_key",
    };

    for (const connectorKey of ["notion", "slack", "telegram", "whatsapp"]) {
      const response = await handleRPC(
        new Request("http://runner.local/rpc", {
          method: "POST",
          body: JSON.stringify({
            method: "connector.describe",
            params: { connectorKey },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.result.key).toBe(connectorKey);
      expect(body.result.runtime).toBe("bun");
      expect(body.result.auth.type).toBe(expectedAuth[connectorKey]);
      expect(Object.keys(body.result.operations)).toContain("healthcheck");
    }
  });

  test("connector.describe returns operation specs from connector manifests", async () => {
    const expectedTimeoutMs: Record<string, number> = {
      slack: 10000,
      telegram: 60000,
    };

    for (const connectorKey of ["slack", "telegram"]) {
      const response = await handleRPC(
        new Request("http://runner.local/rpc", {
          method: "POST",
          body: JSON.stringify({
            method: "connector.describe",
            params: { connectorKey },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.result.operations["messages.list"].kind).toBe("sync");
      expect(body.result.operations["messages.list"].timeoutMs).toBe(expectedTimeoutMs[connectorKey]);
      expect(body.result.operations["messages.send"].kind).toBe("action");
      expect(body.result.network.allowedHosts.length).toBeGreaterThan(0);
    }
  });

  test("connector.healthcheck returns ok for fake connector", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.healthcheck",
          params: { connectorKey: "fake" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.status).toBe("ok");
  });

  test("connector.healthcheck returns ok for Notion, Slack, Telegram, and WhatsApp", async () => {
    for (const connectorKey of ["notion", "slack", "telegram", "whatsapp"]) {
      const response = await handleRPC(
        new Request("http://runner.local/rpc", {
          method: "POST",
          body: JSON.stringify({
            method: "connector.healthcheck",
            params: { connectorKey },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.result.status).toBe("ok");
      expect(body.result.connector).toBe(connectorKey);
      expect(body.result.source).toBe("connector");
    }
  });

  test("connector.healthcheck with no credential input returns the static validator status", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.healthcheck",
          params: { connectorKey: "brevo", input: {} },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({ connector: "brevo", status: "ok", source: "connector" });
  });

  // A real credentialed healthcheck makes an authenticated provider call. The
  // `fetch` mock cannot be injected through JSON-RPC params (functions do not
  // serialize), so we exercise the brevo handler directly with a mocked 401 to
  // assert the structured CONNECTOR_UPSTREAM_ERROR the server layer propagates.
  test("connector.healthcheck (brevo) with credential + mocked 401 → CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      brevoHealthcheck({
        apiKey: "bad-key",
        fetch: async () => Response.json({ message: "unauthorized" }, { status: 401 }),
      }) as Promise<unknown>,
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("connector.action.execute returns fake action output", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "fake",
            action: "messages.send",
            input: { text: "hello" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("fake");
    expect(body.result.output.action).toBe("messages.send");
    expect(body.result.output.input.text).toBe("hello");
  });

  test("connector.action.execute validates telegram messages.send", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "telegram",
            action: "messages.send",
            input: { chatId: "1001", text: "hello" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("telegram");
    expect(body.result.output.action).toBe("messages.send");
    expect(body.result.output.source).toBe("connector");
    expect(body.result.output.validated.chatId).toBe("1001");
  });

  test("connector.action.execute validates telegram credentials", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "telegram",
            action: "credentials.validate",
            input: { botToken: "123456:secret" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("telegram");
    expect(body.result.output.action).toBe("credentials.validate");
    expect(body.result.output.valid).toBe(true);
  });

  test("connector.action.execute validates notion credentials", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "credentials.validate",
            input: { notionToken: "secret_notion_token" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("credentials.validate");
    expect(body.result.output.valid).toBe(true);
  });

  test("connector.action.execute validates notion comments list", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "comments.list",
            input: {
              blockId: "33333333-3333-3333-3333-333333333333",
              pageSize: 25,
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("comments.list");
    expect(body.result.output.validated).toEqual({
      blockId: "33333333-3333-3333-3333-333333333333",
      pageSize: 25,
    });
  });

  test("connector.action.execute validates notion comment create", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "comments.create",
            input: {
              pageId: "33333333-3333-3333-3333-333333333333",
              text: "Ship the connector.",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("comments.create");
    expect(body.result.output.validated).toEqual({
      pageId: "33333333-3333-3333-3333-333333333333",
      text: "Ship the connector.",
    });
  });

  test("connector.action.execute validates notion document search", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "documents.search",
            input: { query: "Appcall", pageSize: 20 },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("documents.search");
    expect(body.result.output.validated).toEqual({
      query: "Appcall",
      pageSize: 20,
    });
  });

  test("connector.action.execute validates notion document get", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "documents.get",
            input: { pageId: "33333333-3333-3333-3333-333333333333" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("documents.get");
    expect(body.result.output.validated).toEqual({
      pageId: "33333333-3333-3333-3333-333333333333",
    });
  });

  test("connector.action.execute validates notion document create", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "documents.create",
            input: {
              parentPageId: "33333333-3333-3333-3333-333333333333",
              title: "Launch Notes",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("documents.create");
    expect(body.result.output.validated).toEqual({
      parentPageId: "33333333-3333-3333-3333-333333333333",
      title: "Launch Notes",
    });
  });

  test("connector.action.execute validates notion document trash and restore", async () => {
    for (const action of ["documents.trash", "documents.restore"]) {
      const response = await handleRPC(
        new Request("http://runner.local/rpc", {
          method: "POST",
          body: JSON.stringify({
            method: "connector.action.execute",
            params: {
              connectorKey: "notion",
              action,
              input: {
                pageId: "33333333-3333-3333-3333-333333333333",
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.result.output.connector).toBe("notion");
      expect(body.result.output.action).toBe(action);
      expect(body.result.output.validated).toEqual({
        pageId: "33333333-3333-3333-3333-333333333333",
      });
    }
  });

  test("connector.action.execute validates notion database get", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "databases.get",
            input: {
              databaseId: "44444444-4444-4444-4444-444444444444",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("databases.get");
    expect(body.result.output.validated).toEqual({
      databaseId: "44444444-4444-4444-4444-444444444444",
    });
  });

  test("connector.action.execute validates notion database item query", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "databases.items.query",
            input: {
              databaseId: "44444444-4444-4444-4444-444444444444",
              filters: [{ property: "Status", type: "status", equals: "Todo" }],
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("databases.items.query");
    expect(body.result.output.validated).toEqual({
      databaseId: "44444444-4444-4444-4444-444444444444",
      filters: [{ property: "Status", type: "status", equals: "Todo" }],
    });
  });

  test("connector.action.execute validates notion database item get", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "databases.items.get",
            input: {
              pageId: "66666666-6666-6666-6666-666666666666",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("databases.items.get");
    expect(body.result.output.validated).toEqual({
      pageId: "66666666-6666-6666-6666-666666666666",
    });
  });

  test("connector.action.execute validates notion database item create", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "databases.items.create",
            input: {
              databaseId: "44444444-4444-4444-4444-444444444444",
              properties: {
                Name: { type: "title", value: "Ship database create" },
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("databases.items.create");
    expect(body.result.output.validated).toEqual({
      databaseId: "44444444-4444-4444-4444-444444444444",
      properties: {
        Name: { type: "title", value: "Ship database create" },
      },
    });
  });

  test("connector.action.execute validates notion database item update", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "databases.items.update",
            input: {
              pageId: "66666666-6666-6666-6666-666666666666",
              properties: {
                Status: { type: "status", value: "Done" },
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("databases.items.update");
    expect(body.result.output.validated).toEqual({
      pageId: "66666666-6666-6666-6666-666666666666",
      properties: {
        Status: { type: "status", value: "Done" },
      },
    });
  });

  test("connector.action.execute validates notion database item trash and restore", async () => {
    for (const action of ["databases.items.trash", "databases.items.restore"]) {
      const response = await handleRPC(
        new Request("http://runner.local/rpc", {
          method: "POST",
          body: JSON.stringify({
            method: "connector.action.execute",
            params: {
              connectorKey: "notion",
              action,
              input: {
                pageId: "66666666-6666-6666-6666-666666666666",
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.result.output.connector).toBe("notion");
      expect(body.result.output.action).toBe(action);
      expect(body.result.output.validated).toEqual({
        pageId: "66666666-6666-6666-6666-666666666666",
      });
    }
  });

  test("connector.action.execute validates notion document block listing", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "documents.blocks.list",
            input: {
              blockId: "33333333-3333-3333-3333-333333333333",
              depth: 2,
              pageSize: 50,
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("documents.blocks.list");
    expect(body.result.output.validated).toEqual({
      blockId: "33333333-3333-3333-3333-333333333333",
      depth: 2,
      pageSize: 50,
    });
  });

  test("connector.action.execute validates notion document block append", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "notion",
            action: "documents.blocks.append",
            input: {
              blockId: "33333333-3333-3333-3333-333333333333",
              text: "Append this paragraph.",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.action).toBe("documents.blocks.append");
    expect(body.result.output.validated).toEqual({
      blockId: "33333333-3333-3333-3333-333333333333",
      text: "Append this paragraph.",
    });
  });

  test("connector.action.execute validates slack messages.send", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "slack",
            action: "messages.send",
            input: { channel: "C123", text: "hello" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("slack");
    expect(body.result.output.action).toBe("messages.send");
    expect(body.result.output.source).toBe("connector");
    expect(body.result.output.validated.channel).toBe("C123");
  });

  test("connector.action.execute validates whatsapp messages.send", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "whatsapp",
            action: "messages.send",
            input: { phoneNumberId: "123456789", to: "15551234567", text: "hello" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("whatsapp");
    expect(body.result.output.action).toBe("messages.send");
    expect(body.result.output.source).toBe("connector");
    expect(body.result.output.validated.phoneNumberId).toBe("123456789");
  });

  test("connector.action.execute validates whatsapp credentials", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.action.execute",
          params: {
            connectorKey: "whatsapp",
            action: "credentials.validate",
            input: { accessToken: "meta-token", phoneNumberId: "123456789" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("whatsapp");
    expect(body.result.output.action).toBe("credentials.validate");
    expect(body.result.output.valid).toBe(true);
  });

  test("connector.action.execute rejects manifest sync operations", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_sync_action",
          method: "connector.action.execute",
          params: {
            connectorKey: "slack",
            action: "messages.list",
            input: { channel: "C123" },
          },
        }),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.id).toBe("req_sync_action");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("ACTION_NOT_EXECUTABLE");
  });

  test("connector.action.execute rejects undeclared manifest actions before handler dispatch", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_undeclared_action",
          method: "connector.action.execute",
          params: {
            connectorKey: "slack",
            action: "messages.delete",
            input: { channel: "C123", ts: "1710000000.000100" },
          },
        }),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.id).toBe("req_undeclared_action");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("ACTION_NOT_DECLARED");
  });

  test("connector.action.execute rejects invalid connector action input", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_invalid",
          method: "connector.action.execute",
          params: {
            connectorKey: "slack",
            action: "messages.send",
            input: { channel: "", text: "hello" },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.id).toBe("req_invalid");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_ACTION_INPUT");
  });

  test("connector.action.execute rejects input larger than manifest limit", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_large_action",
          method: "connector.action.execute",
          params: {
            connectorKey: "fake",
            action: "messages.send",
            input: { text: "x".repeat(70000) },
          },
        }),
      }),
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.id).toBe("req_large_action");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INPUT_TOO_LARGE");
  });

  test("connector.sync.list dispatches Slack messages.list through connector-owned sync handler", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_slack_sync",
          method: "connector.sync.list",
          params: {
            connectorKey: "slack",
            sync: "messages.list",
            input: {
              channelId: "C123",
              response: {
                ok: true,
                messages: [{
                  type: "message",
                  user: "U123",
                  text: "hello from slack",
                  ts: "1715680861.000100",
                }],
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("req_slack_sync");
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("slack");
    expect(body.result.output.sync).toBe("messages.list");
    expect(body.result.output.provider).toBe("slack");
    expect(body.result.output.items[0].id).toBe("slack:C123:1715680861.000100");
  });

  test("connector.sync.list dispatches Telegram messages.list through connector-owned sync handler", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.sync.list",
          params: {
            connectorKey: "telegram",
            sync: "messages.list",
            input: {
              response: {
                ok: true,
                result: [{
                  update_id: 777,
                  message: {
                    message_id: 42,
                    chat: { id: 1001 },
                    from: { id: 501 },
                    text: "hello from telegram",
                  },
                }],
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("telegram");
    expect(body.result.output.sync).toBe("messages.list");
    expect(body.result.output.provider).toBe("telegram");
    expect(body.result.output.items[0].id).toBe("telegram:1001:42");
  });

  test("connector.sync.list dispatches Notion users.list through connector-owned sync handler", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.sync.list",
          params: {
            connectorKey: "notion",
            sync: "users.list",
            input: {
              response: {
                object: "list",
                type: "user",
                user: {},
                next_cursor: null,
                has_more: false,
                results: [{
                  object: "user",
                  id: "11111111-1111-1111-1111-111111111111",
                  name: "Ada Lovelace",
                  avatar_url: null,
                  type: "person",
                  person: { email: "ada@example.com" },
                }],
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.output.connector).toBe("notion");
    expect(body.result.output.sync).toBe("users.list");
    expect(body.result.output.provider).toBe("notion");
    expect(body.result.output.items[0].id).toBe("notion:11111111-1111-1111-1111-111111111111");
  });

  test("connector.sync.list rejects manifest action operations", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_action_sync",
          method: "connector.sync.list",
          params: {
            connectorKey: "slack",
            sync: "messages.send",
            input: { channel: "C123", text: "hello" },
          },
        }),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.id).toBe("req_action_sync");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SYNC_NOT_EXECUTABLE");
  });

  test("connector.sync.list rejects invalid connector sync input", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_invalid_sync",
          method: "connector.sync.list",
          params: {
            connectorKey: "telegram",
            sync: "messages.list",
            input: { response: { ok: true, result: {} } },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.id).toBe("req_invalid_sync");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_SYNC_INPUT");
  });

  test("connector.sync.list rejects input larger than manifest limit", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_large_sync",
          method: "connector.sync.list",
          params: {
            connectorKey: "slack",
            sync: "messages.list",
            input: {
              channelId: "C123",
              response: {
                messages: [{ ts: "1710000000.000100", user: "U123", text: "x".repeat(70000) }],
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.id).toBe("req_large_sync");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INPUT_TOO_LARGE");
  });

  test("unknown method returns protocol error", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({ method: "unknown.method" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNKNOWN_METHOD");
  });

  test("logs use envelope request id when present", async () => {
    const info = spyOn(console, "info").mockImplementation(() => undefined);

    await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        headers: { "x-request-id": "header_request" },
        body: JSON.stringify({ id: "req_envelope", method: "runner.describe" }),
      }),
    );

    expect(info).toHaveBeenCalledTimes(1);
    const log = JSON.parse(info.mock.calls[0]?.[0] as string);
    expect(log.requestID).toBe("req_envelope");
  });
});

describe("connector webhook RPC", () => {
  const rb2bPayload = {
    event_id: "evt_777",
    first_name: "Dana",
    last_name: "Scully",
    linkedin_url: "https://www.linkedin.com/in/danascully",
    business_email: "dana@example.com",
    company_name: "Example Corp",
    job_title: "VP Sales",
    city: "Austin",
    region: "TX",
    pages: [{ url: "https://acme.com/pricing", timestamp: "2026-05-29T10:00:00Z" }],
    timestamp: "2026-05-29T10:00:01Z",
  };

  test("connector.webhook.parse returns idempotencyKey, operation, and sanitized payload", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_wh_parse",
          method: "connector.webhook.parse",
          params: { connectorKey: "rb2b", payload: rb2bPayload },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.idempotencyKey).toBe("rb2b-wh:evt_777");
    expect(body.result.operation).toBe("webhook.visitor_identified");
    expect(body.result.sanitized.provider).toBe("rb2b");
    expect(body.result.sanitized.workEmail).toBe("dana@example.com");
  });

  test("connector.webhook.verify accepts RB2B's default unsigned delivery", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_wh_verify",
          method: "connector.webhook.verify",
          params: { connectorKey: "rb2b", headers: {}, payload: rb2bPayload },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.verified).toBe(true);
  });

  test("connector.webhook.parse rejects a connector with no webhook handler", async () => {
    const response = await handleRPC(
      new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          method: "connector.webhook.parse",
          params: { connectorKey: "calendly", payload: {} },
        }),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNKNOWN_CONNECTOR");
  });
});
