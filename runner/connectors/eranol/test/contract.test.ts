import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const job = {
  job_id: "job_fixture-1",
  status: "pending",
  message: "Job created. Poll status_url for progress.",
  job_type: "caption",
  result_url: "https://eranol.com/api/v1/ffmpeg/result/job_fixture-1",
  status_url: "https://eranol.com/api/v1/ffmpeg/status/job_fixture-1",
};

describe("Eranol contract", () => {
  test("caption uses the x-api-key header and one JSON route", async () => {
    const seen: Request[] = [];
    await actions["videos.caption"]!({
      apiKey: "secret",
      url: "https://cdn.example.com/video.mp4",
      position: "bottom",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(job);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/ffmpeg/video/caption");
    expect(await seen[0].text()).toBe(
      '{"url":"https://cdn.example.com/video.mp4","position":"bottom"}',
    );
  });

  test("encodes the job id and does not follow result links", async () => {
    const seen: Request[] = [];
    const result = await actions["jobs.status"]!({
      apiKey: "secret",
      jobId: "job/a",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ job_id: "job/a", status: "processing", result_url: "https://evil.example/file" }]);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/ffmpeg/status/job%2Fa");
    expect(result.data).toHaveLength(1);
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(
      actions["jobs.delete"]!({ apiKey: "secret", jobId: "", fetch: async () => response({}) }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["videos.caption"]!({
        apiKey: "secret",
        url: "https://cdn.example.com/video.mp4",
        fetch: async () => response({ nope: true }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(
      actions["jobs.status"]!({ apiKey: "secret", jobId: "job_1", fetch: async () => response({}, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions["jobs.status"]!({
        apiKey: "secret",
        jobId: "job_1",
        fetch: async () => response({}, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
