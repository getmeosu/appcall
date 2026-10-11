import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")) as any;
const bunSrc = process.env.APPCALL_BUN_SRC_ROOT ?? "../../../bun/src";
const { compileDeclarativeConnector } = await import(`${bunSrc}/declarative/compile.ts`);
const { uploadAdVideo } = await import("../src/uploads.ts");

describe("tiktok-ads multipart uploads", () => {
  it("posts video bytes as multipart form data to the ad video upload path", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await uploadAdVideo({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      upload_type: "UPLOAD_BY_FILE",
      fileBase64: Buffer.from("video-bytes").toString("base64"),
      fileName: "spot.mp4",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "r", data: { video_id: "vid-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as { data: { video_id: string } };

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/open_api/v1.3/file/video/ad/upload/");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.body).toBeInstanceOf(FormData);
    expect(new Headers(calls[0]!.init.headers).get("Access-Token")).toBe("fixture-access-token");
    expect(new Headers(calls[0]!.init.headers).get("Content-Type")).toBeNull();
    const form = calls[0]!.init.body as FormData;
    expect(form.get("advertiser_id")).toBe("adv-1");
    expect(form.get("video_file")).toBeInstanceOf(Blob);
    expect(result.data.video_id).toBe("vid-1");
  });

  it("keeps a declarative form request for scalar video upload fields", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    let sent = "";
    await compiled.actions["files.video.upload"]({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      upload_type: "UPLOAD_BY_URL",
      video_url: "https://cdn.example/spot.mp4",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        sent = String(init.body ?? "");
        expect(new Headers(init.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
        return new Response(JSON.stringify({ code: 0, message: "OK", data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const params = new URLSearchParams(sent);
    expect(params.get("advertiser_id")).toBe("adv-1");
    expect(params.get("upload_type")).toBe("UPLOAD_BY_URL");
    expect(params.get("video_url")).toBe("https://cdn.example/spot.mp4");
  });
});
