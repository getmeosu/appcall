import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import {
  loadFixtureCases,
  runCandidateFixtures,
  verifyFixtureCoverage,
} from "../../../../scripts/connector-gen/openconnector/recipe-fixtures.ts";
import { join } from "node:path";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const token = "fixture-callpage-token";

async function invoke(key: string, input: Record<string, unknown>) {
  let captured: Request | undefined;
  const result = await actions[key]!({
    apiKey: token,
    ...input,
    fetch: async (info: RequestInfo | URL, init?: RequestInit) => {
      captured = new Request(info, init);
      return Response.json({ hasError: false, errorCode: 0, message: "", data: { id: 1 } });
    },
  });
  return { captured: captured!, result };
}

describe("callpage compiled HTTP actions", () => {
  test("healthcheck GET /api/v1/external with raw Authorization", async () => {
    const { captured, result } = await invoke("healthcheck", {});
    expect(captured.method).toBe("GET");
    expect(captured.url).toBe("https://core.callpage.io/api/v1/external");
    expect(captured.headers.get("authorization")).toBe(token);
    expect(captured.headers.get("accept")).toBe("application/json");
    expect(result).toMatchObject({ connector: "callpage", action: "healthcheck", source: "provider" });
  });

  test("widgets.get sends origin widget_id", async () => {
    const { captured } = await invoke("widgets.get", { widgetId: 1 });
    expect(new URL(captured.url).searchParams.get("widget_id")).toBe("1");
    expect(new URL(captured.url).pathname).toBe("/api/v1/external/widgets/get");
  });

  test("calls.get uses v3 path", async () => {
    const { captured } = await invoke("calls.get", { callId: 234532 });
    expect(captured.url).toBe("https://core.callpage.io/api/v3/external/calls/234532");
  });

  test("calls.history repeats official array query keys", async () => {
    const { captured } = await invoke("calls.history", {
      display_hidden: 1,
      widget_ids: [2, 3],
      statuses: ["completed", "in-progress"],
      phone_number: "+48123123123",
      limit: 15,
    });
    const url = new URL(captured.url);
    expect(url.pathname).toBe("/api/v3/external/calls/history");
    expect(url.searchParams.getAll("widget_ids[]")).toEqual(["2", "3"]);
    expect(url.searchParams.getAll("statuses[]")).toEqual(["completed", "in-progress"]);
    expect(url.searchParams.get("display_hidden")).toBe("1");
    expect(url.searchParams.get("phone_number")).toBe("+48123123123");
    expect(url.searchParams.get("limit")).toBe("15");
  });

  test("users.create posts JSON without omitted optionals", async () => {
    const { captured } = await invoke("users.create", {
      name: "Test Manager",
      tel: "+48123123123",
      role: "manager",
    });
    expect(captured.method).toBe("POST");
    expect(captured.url).toBe("https://core.callpage.io/api/v1/external/users/create");
    expect(captured.headers.get("content-type")).toBe("application/json");
    expect(await captured.json()).toEqual({
      name: "Test Manager",
      role: "manager",
      tel: "+48123123123",
    });
  });

  test("widgets.call_or_schedule posts id and tel", async () => {
    const { captured } = await invoke("widgets.call_or_schedule", { id: 3, tel: "+48123123123" });
    expect(captured.url).toBe("https://core.callpage.io/api/v1/external/widgets/call-or-schedule");
    expect(await captured.json()).toEqual({ id: 3, tel: "+48123123123" });
  });

  test("widgets.add_users accepts a user_id array", async () => {
    const { captured } = await invoke("widgets.add_users", { id: 3, user_id: [2, 3] });
    expect(captured.url).toBe("https://core.callpage.io/api/v1/external/widgets/add-users");
    expect(await captured.json()).toEqual({ id: 3, user_id: [2, 3] });
  });

  test("managers.list requires widget_id", async () => {
    let called = false;
    await expect(
      actions["managers.list"]!({
        apiKey: token,
        fetch: async () => {
          called = true;
          return Response.json({});
        },
      }),
    ).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  test("sms.create and voice.create post official fields", async () => {
    const sms = await invoke("sms.create", {
      widget_id: 1,
      message_id: "visitor.call-scheduled",
      text: "Hi :name",
      enabled: true,
    });
    expect(sms.captured.url).toBe("https://core.callpage.io/api/v1/external/sms/create");
    expect(await sms.captured.json()).toEqual({
      enabled: true,
      message_id: "visitor.call-scheduled",
      text: "Hi :name",
      widget_id: 1,
    });
    const voice = await invoke("voice.create", {
      widget_id: 1,
      message_id: "visitor.call",
      enabled: true,
      file: "https://example.com/greeting.mp3",
    });
    expect(voice.captured.url).toBe("https://core.callpage.io/api/v1/external/voice/create");
    expect(await voice.captured.json()).toEqual({
      enabled: true,
      file: "https://example.com/greeting.mp3",
      message_id: "visitor.call",
      widget_id: 1,
    });
  });

  test("hasError true on HTTP 200 is CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      actions["healthcheck"]!({
        apiKey: token,
        fetch: async () =>
          Response.json({ hasError: true, errorCode: 401, message: "Unauthorized", data: [] }, { status: 200 }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("callpage fixtures", () => {
  test("replays every fixture case against the prepared manifest", async () => {
    const dir = join(import.meta.dir, "../fixtures/cases");
    const cases = loadFixtureCases(dir);
    const coverage = verifyFixtureCoverage(manifest, cases);
    expect(coverage.missing).toEqual([]);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    const failed = runs.filter((run) => run.status !== "passed");
    expect(failed).toEqual([]);
  });
});
