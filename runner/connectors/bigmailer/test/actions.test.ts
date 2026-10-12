import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { createSuppressionList } from "../src/actions";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);

const brandId = "66e60ece-d4e4-4286-8ea6-990cb500aa8e";

describe("bigmailer compiled HTTP actions", () => {
  test("creates a brand with snake_case JSON and omits unset fields", async () => {
    let captured: Request | undefined;
    const result = await actions["brands.create"]!({
      apiKey: "fixture-token",
      name: "Acme",
      fromName: "Ada",
      fromEmail: "ada@example.com",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ id: brandId }, { status: 200 });
      },
    });
    expect(captured?.url).toBe("https://api.bigmailer.io/v1/brands");
    expect(captured?.method).toBe("POST");
    expect(captured?.headers.get("x-api-key")).toBe("fixture-token");
    expect(captured?.headers.get("content-type")).toMatch(/application\/json/);
    expect(await captured!.json()).toEqual({
      name: "Acme",
      from_name: "Ada",
      from_email: "ada@example.com",
    });
    expect(result).toMatchObject({
      connector: "bigmailer",
      action: "brands.create",
      source: "provider",
      data: { id: brandId },
    });
  });

  test("maps contact fieldValues and validateEmail onto official names", async () => {
    let captured: Request | undefined;
    await actions["contacts.create"]!({
      apiKey: "fixture-token",
      brandId,
      email: "person@example.com",
      validateEmail: true,
      listIds: ["b4326936-9e08-4cf9-95fe-c44c8cf4e4ef"],
      fieldValues: [{ name: "FIRST_NAME", string: "Ada" }],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ id: "contact-1" });
      },
    });
    const url = new URL(captured!.url);
    expect(url.pathname).toBe(`/v1/brands/${brandId}/contacts`);
    expect(url.searchParams.get("validate")).toBe("true");
    expect(await captured!.json()).toEqual({
      email: "person@example.com",
      field_values: [{ name: "FIRST_NAME", string: "Ada" }],
      list_ids: ["b4326936-9e08-4cf9-95fe-c44c8cf4e4ef"],
    });
  });

  test("upserts a contact at /contacts/upsert", async () => {
    let captured: Request | undefined;
    await actions["contacts.upsert"]!({
      apiKey: "fixture-token",
      brandId,
      email: "person@example.com",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ id: "contact-1" });
      },
    });
    expect(new URL(captured!.url).pathname).toBe(`/v1/brands/${brandId}/contacts/upsert`);
    expect(captured?.method).toBe("POST");
  });

  test("posts bulk campaign fromAddress as official from", async () => {
    let captured: Request | undefined;
    await actions["bulkCampaigns.create"]!({
      apiKey: "fixture-token",
      brandId,
      name: "Launch",
      fromAddress: { email: "ada@example.com", name: "Ada" },
      replyTo: { email: "reply@example.com", name: "Support" },
      listIds: ["b4326936-9e08-4cf9-95fe-c44c8cf4e4ef"],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ id: "campaign-1" });
      },
    });
    expect(await captured!.json()).toEqual({
      name: "Launch",
      from: { email: "ada@example.com", name: "Ada" },
      reply_to: { email: "reply@example.com", name: "Support" },
      list_ids: ["b4326936-9e08-4cf9-95fe-c44c8cf4e4ef"],
    });
  });

  test("updates a contact with documented *_op query names", async () => {
    let captured: Request | undefined;
    await actions["contacts.update"]!({
      apiKey: "fixture-token",
      brandId,
      contactId: "person@example.com",
      listIdsOp: "add",
      listIds: ["b4326936-9e08-4cf9-95fe-c44c8cf4e4ef"],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ id: "contact-1" });
      },
    });
    const url = new URL(captured!.url);
    expect(url.pathname).toBe(`/v1/brands/${brandId}/contacts/person%40example.com`);
    expect(url.searchParams.get("list_ids_op")).toBe("add");
    expect(captured?.method).toBe("POST");
  });

  test("reads the authenticated user at /v1/users/me", async () => {
    let captured: Request | undefined;
    const result = await actions["users.me"]!({
      apiKey: "fixture-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = new Request(input, init);
        return Response.json({ email: "ada@example.com", role: "admin" });
      },
    });
    expect(captured?.url).toBe("https://api.bigmailer.io/v1/users/me");
    expect(captured?.method).toBe("GET");
    expect(result).toMatchObject({ action: "users.me", source: "provider" });
  });

  test("rejects extra fields on origin healthcheck", async () => {
    let rejection: unknown;
    try {
      await actions["healthcheck"]!({ apiKey: "fixture-token", nope: true });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});

describe("bigmailer suppression list upload", () => {
  const csv = btoa("email\nada@example.com\n");
  const validInput = {
    apiKey: "fixture-token",
    brandId,
    fileName: "suppress.csv",
    contentBase64: csv,
  };

  test("sends authenticated multipart file and returns the provider response", async () => {
    let receivedUrl = "";
    let receivedRequest: Request | undefined;
    const result = await createSuppressionList({
      ...validInput,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        receivedUrl = String(input);
        receivedRequest = new Request(input, init);
        return Response.json({ id: "sup-1" });
      },
    });
    expect(receivedUrl).toBe(`https://api.bigmailer.io/v1/brands/${brandId}/suppression-lists`);
    expect(receivedRequest?.method).toBe("POST");
    expect(receivedRequest?.headers.get("x-api-key")).toBe("fixture-token");
    expect(receivedRequest?.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    const form = await receivedRequest?.formData();
    expect(form?.get("file")).toBeInstanceOf(Blob);
    expect((form?.get("file") as File).name).toBe("suppress.csv");
    expect(await (form?.get("file") as Blob).text()).toBe("email\nada@example.com\n");
    // Hand-written handler returns only the declared output; the runner owns the envelope.
    expect(result).toEqual({ data: { id: "sup-1" } });
  });

  test("rejects malformed base64 before making a request", async () => {
    let called = false;
    let rejection: unknown;
    try {
      await createSuppressionList({
        ...validInput,
        contentBase64: "not base64!",
        fetch: async () => {
          called = true;
          return Response.json({});
        },
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
