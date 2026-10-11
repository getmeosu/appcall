import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { DEPTH_OPS, runDepthOp, zoomDepthHandlers, validateDepthInput } from "../src/depth";
import { getMeeting, getUser, addMeetingRegistrant } from "../src/actions";

const TOKEN = "tok_test";

async function call(specAction: string, input: Record<string, unknown>, status: number, body: unknown = { ok: true }) {
  const spec = DEPTH_OPS.find((item) => item.action === specAction);
  if (!spec) throw new Error(`missing spec ${specAction}`);
  const requests: Request[] = [];
  const result = await runDepthOp(spec, {
    ...input,
    accessToken: TOKEN,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(new Request(url, init));
      if (body === null) return new Response("", { status });
      if (typeof body === "string") return new Response(body, { status });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  });
  return { result: result as Record<string, unknown>, requests };
}

function expectedPath(spec: (typeof DEPTH_OPS)[number]): string {
  const validated = validateDepthInput(spec, spec.sample);
  return spec.path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name: string) => {
    return encodeURIComponent(String(validated[name] ?? ""));
  });
}

describe("zoom depth ops cover Composio tools", () => {
  test("every depth op is registered as a handler and manifest action", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; inputSchema?: { type: string; required?: unknown[] } }>;
    expect(DEPTH_OPS).toHaveLength(92);
    expect(new Set(DEPTH_OPS.map((item) => item.tool)).size).toBe(92);
    for (const spec of DEPTH_OPS) {
      expect(zoomDepthHandlers[spec.action]).toBeTypeOf("function");
      expect(ops[spec.action]).toBeDefined();
      expect(ops[spec.action].kind).toBe("action");
      expect(typeof ops[spec.action].title).toBe("string");
      expect(ops[spec.action].inputSchema?.type).toBe("object");
      expect(Array.isArray(ops[spec.action].inputSchema?.required)).toBe(true);
    }
  });

  test("new Composio webhook operations use sideEffect read", () => {
    const ops = manifest.operations as Record<string, { kind: string; sideEffect?: string }>;
    const keys = [
      "webhook.daily_usage_report_changed",
      "webhook.meeting_details_changed",
      "webhook.meeting_recording_changed",
      "webhook.meeting_summary_updated",
      "webhook.new_cloud_recording",
      "webhook.new_meeting_created",
      "webhook.new_meeting_participant",
      "webhook.new_webinar_created",
      "webhook.new_webinar_participant",
      "webhook.user_information_changed",
      "webhook.webinar_details_changed",
    ];
    for (const key of keys) {
      expect(ops[key].kind).toBe("webhook");
      expect(ops[key].sideEffect).toBe("read");
    }
  });
});

describe("existing ops accept Composio snake_case aliases", () => {
  test("meetings.get accepts meeting_id", () => {
    const result = getMeeting({ meeting_id: "123456789" }) as Record<string, unknown>;
    expect((result.validated as { meetingId: string }).meetingId).toBe("123456789");
  });

  test("users.get accepts user_id", () => {
    const result = getUser({ user_id: "me" }) as Record<string, unknown>;
    expect((result.validated as { userId: string }).userId).toBe("me");
  });

  test("meetings.add_registrant accepts meeting_id", () => {
    const result = addMeetingRegistrant({ meeting_id: "123", email: "a@b.c", first_name: "Ada" }) as Record<string, unknown>;
    expect((result.validated as { meetingId: string }).meetingId).toBe("123");
  });
});

for (const spec of DEPTH_OPS) {
  describe(spec.action, () => {
    test("validates without accessToken", () => {
      const result = runDepthOp(spec, spec.sample) as Record<string, unknown>;
      expect(result.connector).toBe("zoom");
      expect(result.action).toBe(spec.action);
      expect(result.source).toBe("connector");
      expect(result.validated).toBeDefined();
    });

    test("calls the Zoom HTTP endpoint", async () => {
      const status = spec.method === "DELETE" ? 204 : spec.method === "POST" ? 201 : 200;
      const { result, requests } = await call(spec.action, spec.sample as Record<string, unknown>, status, { id: spec.action });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe(spec.method);
      expect(requests[0].headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      const url = new URL(requests[0].url);
      expect(url.origin).toBe("https://api.zoom.us");
      expect(url.pathname).toBe(expectedPath(spec));
      expect(result.action).toBe(spec.action);
      expect(result.data).toEqual({ id: spec.action });
    });

    test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
      await expect(call(spec.action, spec.sample as Record<string, unknown>, 429, { message: "slow down" })).rejects.toMatchObject({
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
      });
    });

    test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
      await expect(call(spec.action, spec.sample as Record<string, unknown>, 500, { message: "nope" })).rejects.toMatchObject({
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
      });
    });
  });
}
