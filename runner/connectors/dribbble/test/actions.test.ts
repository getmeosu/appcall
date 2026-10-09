import { describe, expect, it } from "bun:test";
import { actions as connectorActions, createAttachment, createShot } from "../src/actions";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";

const actions = connectorActions;

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

for (const c of cases) {
  describe(c.op, () => {
    it("validates without credentials", async () => {
      const r = await actions[c.op]!({ ...c.input, unexpected: "ignored" });
      expect(r).toMatchObject(c.op === "healthcheck" ? { status: "ok" } : { validated: c.input });
      expect(JSON.stringify(r)).not.toContain("ignored");
    });
    it("sends the documented URL, method, authentication and body", async () => {
      let count = 0;
      const r = await actions[c.op]!({
        ...c.input,
        accessToken: "test-secret",
        fetch: async (url: unknown, init?: RequestInit) => {
          count++;
          expect(String(url)).toBe(manifest.http.baseUrl + c.path);
          expect(init?.method).toBe(c.method);
          const headers = new Headers(init?.headers);
          expect(headers.get("Authorization")).toBe("Bearer test-secret");
          expect(headers.get("Content-Type")).toBe("application/json");
          expect(init?.body ? JSON.parse(String(init.body)) : null).toEqual(c.body);
          return new Response(c.response === null ? null : JSON.stringify(c.response), { status: c.status, headers: c.headers });
        },
      });
      expect(count).toBe(1);
      expect(r).toMatchObject(c.output);
    });
    it("surfaces upstream failures", async () => {
      await expect(
        actions[c.op]!({
          ...c.input,
          accessToken: "test-secret",
          fetch: async () => new Response(JSON.stringify({ message: "Forbidden", meta: { msg: "Forbidden" } }), { status: 403 }),
        }),
      ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("Forbidden") });
    });
  });
}

it("uses the provider rate reset semantics", async () => {
  const headers = { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) };
  try {
    await actions["users.me"]!({ accessToken: "test-secret", fetch: async () => new Response("{}", { status: 429, headers }) });
    throw new Error("unexpected success");
  } catch (e) {
    expect(e).toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
    const delay = (e as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(delay).toBeGreaterThanOrEqual(28);
    expect(delay).toBeLessThanOrEqual(30);
  }
});

it("rejects missing identifiers before any request", async () => {
  let called = false;
  try {
    await actions["shots.get"]!({
      accessToken: "test-secret",
      fetch: async () => {
        called = true;
        return new Response("{}");
      },
    });
    throw new Error("unexpected success");
  } catch (e) {
    expect(e).toMatchObject({ code: "INVALID_ACTION_INPUT" });
  }
  expect(called).toBe(false);
});

it("omits unset paging parameters and the absent final-page Link", async () => {
  const result = await actions["shots.list"]!({
    accessToken: "test-secret",
    fetch: async (url: unknown) => {
      expect(String(url)).toBe("https://api.dribbble.com/v2/user/shots");
      return new Response("[]");
    },
  });
  expect(result).toMatchObject({ shots: [] });
  expect(result).not.toHaveProperty("paginationLink");
});

it("sends only supplied update fields, preserving false and empty arrays", async () => {
  await actions["shots.update"]!({
    id: 45,
    lowProfile: false,
    tags: [],
    accessToken: "test-secret",
    fetch: async (_url: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ low_profile: false, tags: [] });
      return new Response('{"id":45}');
    },
  });
});

it("falls back when reset timestamp is absent or expired", async () => {
  for (const reset of [undefined, "1"]) {
    await expect(
      actions["users.me"]!({
        accessToken: "test-secret",
        fetch: async () => new Response("{}", { status: 429, headers: reset ? { "x-ratelimit-reset": reset } : {} }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  }
});

it("omits unset project update fields", async () => {
  await actions["projects.update"]!({
    id: 3,
    name: "Sherpa",
    accessToken: "test-secret",
    fetch: async (_url: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ name: "Sherpa" });
      return new Response('{"id":3,"name":"Sherpa"}');
    },
  });
});

describe("shots.create", () => {
  it("rejects missing title or image before any request", async () => {
    let called = false;
    const fetch = async () => {
      called = true;
      return new Response(null, { status: 202 });
    };
    await expect(createShot({ accessToken: "test-secret", title: "Sketch", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(createShot({ accessToken: "test-secret", image: "aGVsbG8=", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    expect(called).toBe(false);
  });

  it("posts multipart image, title, tags and optional fields", async () => {
    let count = 0;
    const result = await createShot({
      accessToken: "test-secret",
      title: "Sketch",
      image: png,
      imageFileName: "sketch.png",
      description: "An illustration",
      tags: ["art", "wip"],
      lowProfile: false,
      teamId: 39,
      fetch: async (url: unknown, init?: RequestInit) => {
        count++;
        expect(String(url)).toBe("https://api.dribbble.com/v2/shots");
        expect(init?.method).toBe("POST");
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer test-secret");
        expect(headers.get("Content-Type") ?? "").not.toContain("application/json");
        const form = init?.body as FormData;
        expect(form).toBeInstanceOf(FormData);
        const file = form.get("image");
        expect(file).toBeInstanceOf(Blob);
        expect((file as File).name).toBe("sketch.png");
        expect(form.get("title")).toBe("Sketch");
        expect(form.get("description")).toBe("An illustration");
        expect(form.get("low_profile")).toBe("false");
        expect(form.get("team_id")).toBe("39");
        expect(form.getAll("tags[]")).toEqual(["art", "wip"]);
        return new Response(null, {
          status: 202,
          headers: { Location: "https://api.dribbble.com/v2/shots/471756" },
        });
      },
    });
    expect(count).toBe(1);
    expect(result).toMatchObject({
      connector: "dribbble",
      action: "shots.create",
      source: "provider",
      accepted: true,
      location: "https://api.dribbble.com/v2/shots/471756",
      shotId: 471756,
    });
  });

  it("uses Dribbble unix rate-reset semantics", async () => {
    const headers = { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) };
    try {
      await createShot({
        accessToken: "test-secret",
        title: "Sketch",
        image: png,
        fetch: async () => new Response("{}", { status: 429, headers }),
      });
      throw new Error("unexpected success");
    } catch (e) {
      expect(e).toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
      const delay = (e as { retryAfterSeconds: number }).retryAfterSeconds;
      expect(delay).toBeGreaterThanOrEqual(28);
      expect(delay).toBeLessThanOrEqual(30);
    }
  });
});

describe("attachments.create", () => {
  it("posts multipart file to the shot attachments path", async () => {
    let count = 0;
    const result = await createAttachment({
      accessToken: "test-secret",
      shotId: 45,
      file: "aGVsbG8=",
      fileName: "detail.jpg",
      contentType: "image/jpeg",
      fetch: async (url: unknown, init?: RequestInit) => {
        count++;
        expect(String(url)).toBe("https://api.dribbble.com/v2/shots/45/attachments");
        expect(init?.method).toBe("POST");
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer test-secret");
        const form = init?.body as FormData;
        const file = form.get("file");
        expect(file).toBeInstanceOf(Blob);
        expect((file as File).name).toBe("detail.jpg");
        expect(await (file as Blob).text()).toBe("hello");
        return new Response(null, { status: 202 });
      },
    });
    expect(count).toBe(1);
    expect(result).toMatchObject({
      connector: "dribbble",
      action: "attachments.create",
      source: "provider",
      accepted: true,
    });
  });

  it("rejects missing shotId before any request", async () => {
    let called = false;
    await expect(
      createAttachment({
        accessToken: "test-secret",
        file: "aGVsbG8=",
        fetch: async () => {
          called = true;
          return new Response(null, { status: 202 });
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
