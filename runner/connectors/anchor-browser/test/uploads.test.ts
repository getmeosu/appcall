import { describe, expect, test } from "bun:test";
import { uploadAgentFile, uploadExtension, uploadSessionFile } from "../src/uploads";
import extensionFixture from "../fixtures/cases/extensions-upload-success.json";
import agentFixture from "../fixtures/cases/sessions-agent-files-upload-success.json";
import sessionFixture from "../fixtures/cases/sessions-uploads-create-success.json";
import extensionExpected from "../fixtures/expected/extensions-upload-success.json";
import agentExpected from "../fixtures/expected/sessions-agent-files-upload-success.json";
import sessionExpected from "../fixtures/expected/sessions-uploads-create-success.json";

const apiKey = "fixturekey";

describe("Anchor Browser multipart uploads", () => {
  test("uploads an extension ZIP to POST /v1/extensions", async () => {
    let receivedUrl = "";
    let receivedRequest: Request | undefined;
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      receivedUrl = String(input);
      receivedRequest = new Request(input, init);
      return Response.json(extensionExpected.data);
    };

    const result = await uploadExtension({
      apiKey,
      ...extensionFixture.input,
      file_content_base64: "aGVsbG8=",
      file_name: "hello.zip",
      fetch,
    });

    expect(receivedUrl).toBe("https://api.anchorbrowser.io/v1/extensions");
    expect(receivedRequest?.method).toBe("POST");
    expect(receivedRequest?.headers.get("anchor-api-key")).toBe(apiKey);
    expect(receivedRequest?.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    const form = await receivedRequest?.formData();
    expect(form?.get("name")).toBe(extensionFixture.input.name);
    expect(form?.get("file")).toBeInstanceOf(Blob);
    expect((form?.get("file") as File).name).toBe("hello.zip");
    expect(await (form?.get("file") as Blob).text()).toBe("hello");
    expect(result).toEqual(extensionExpected);
  });

  test("uploads an agent resource onto a session", async () => {
    let receivedUrl = "";
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      receivedUrl = String(input);
      const request = new Request(input, init);
      const form = await request.formData();
      expect(form.get("file")).toBeInstanceOf(Blob);
      return Response.json(agentExpected.data);
    };

    const result = await uploadAgentFile({
      apiKey,
      ...agentFixture.input,
      file_content_base64: "aGVsbG8=",
      file_name: "hello.txt",
      fetch,
    });

    expect(receivedUrl).toBe("https://api.anchorbrowser.io/v1/sessions/sess_demo/agent/files");
    expect(result).toEqual(agentExpected);
  });

  test("uploads a session form file", async () => {
    let receivedUrl = "";
    const fetch = async (input: RequestInfo | URL) => {
      receivedUrl = String(input);
      return Response.json(sessionExpected.data);
    };

    const result = await uploadSessionFile({
      apiKey,
      ...sessionFixture.input,
      file_content_base64: "aGVsbG8=",
      file_name: "hello.txt",
      fetch,
    });

    expect(receivedUrl).toBe("https://api.anchorbrowser.io/v1/sessions/sess_demo/uploads");
    expect(result).toEqual(sessionExpected);
  });

  test("rejects malformed base64 before making a request", async () => {
    let called = false;
    const fetch = async () => {
      called = true;
      return Response.json({});
    };
    let rejection: unknown;
    try {
      await uploadExtension({
        apiKey,
        name: "bad",
        file_content_base64: "not base64!",
        file_name: "bad.zip",
        fetch,
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
