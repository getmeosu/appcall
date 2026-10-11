import { describe, expect, test } from "bun:test";
import {
  LEVER_ACTION_KEYS,
  LEVER_ACTION_SPECS,
  createLeverActionHandlers,
  executeLeverAction,
} from "../src/actions";
import manifest from "../manifest.json";

const auth = { apiKey: "fixturekey", region: "co" };
const OPP = "3410c8b9-5c31-4bab-b7e9-9f710206d647";
const USER = "8d49b010-cc6a-4f40-ace5-e86061c677ed";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function sampleInput(spec: (typeof LEVER_ACTION_SPECS)[string]): Record<string, unknown> {
  const input: Record<string, unknown> = { ...auth };
  for (const name of spec.required) {
    if (name === "links" || name === "sources" || name === "tags" || name === "emails" || name === "followers") {
      input[name] = ["https://linkedin.com/in/ada"];
      if (name === "emails") input[name] = ["ada@example.com"];
      if (name === "tags") input[name] = ["python"];
      if (name === "sources") input[name] = ["LinkedIn"];
      if (name === "followers") input[name] = [USER];
    } else if (name === "fields" || name === "values" || name === "interviewers" || name === "interviews") {
      input[name] = name === "values" && spec.slug.includes("DELETE")
        ? ["5dc3d8e7-db49-44e5-99e9-fec13a305533"]
        : name === "values"
          ? [{ text: "hourly" }]
          : name === "interviewers"
            ? [{ id: USER, email: "ada@example.com" }]
            : name === "interviews"
              ? [{ date: 1_700_000_000_000, duration: 30, interviewers: [{ id: USER }] }]
              : [{ id: "field-1", type: "text", text: "Start", value: "soon" }];
    } else if (name === "date" || name === "duration" || name === "headcountTotal" || name === "createdAt") {
      input[name] = name === "headcountTotal" ? 2 : name === "duration" ? 30 : 1_700_000_000_000;
    } else if (name === "isRequired") {
      input[name] = true;
    } else if (name === "parse" || name === "secret") {
      input[name] = true;
    } else if (name === "email") {
      input[name] = "ada@example.com";
    } else if (name === "name") {
      input[name] = "Ada Lovelace";
    } else if (name === "text") {
      input[name] = "Offer information";
    } else if (name === "value") {
      input[name] = "Strong hire";
    } else if (name === "timezone") {
      input[name] = "America-New_York";
    } else if (name === "accessRole") {
      input[name] = "admin";
    } else if (name === "type") {
      input[name] = "dropdown";
    } else if (name === "requisitionCode") {
      input[name] = "ENG-12";
    } else if (name === "id") {
      input[name] = "work_type";
    } else if (name === "perform_as") {
      input[name] = USER;
    } else if (name === "opportunity") {
      input[name] = OPP;
    } else if (name === "user") {
      input[name] = USER;
    } else if (name === "stage") {
      input[name] = "00922a60-7c15-422b-b086-f62000824fd7";
    } else {
      input[name] = "a80bbbe0-d4dd-4eac-bdbf-302345414f93";
    }
  }
  if (spec.multipart) {
    input.file_name = "resume.pdf";
    input.file_content = Buffer.from("hello").toString("base64");
    input.file_mimetype = "application/pdf";
  }
  return input;
}

describe("Lever Composio-depth actions", () => {
  test("registers 53 handwritten handlers matching the manifest", () => {
    const handlers = createLeverActionHandlers();
    expect(LEVER_ACTION_KEYS).toHaveLength(53);
    expect(Object.keys(handlers).sort()).toEqual([...LEVER_ACTION_KEYS].sort());
    for (const key of LEVER_ACTION_KEYS) {
      const op = manifest.operations[key as keyof typeof manifest.operations] as {
        kind: string;
        title: string;
        description: string;
        sideEffect: string;
        inputSchema: { type: string };
      };
      expect(op).toBeTruthy();
      expect(op.kind).toBe("action");
      expect(op.title.length).toBeGreaterThan(0);
      expect(op.description.length).toBeGreaterThan(0);
      expect(op.inputSchema.type).toBe("object");
      expect(op.sideEffect).toBe(LEVER_ACTION_SPECS[key].method === "GET" ? "read" : "write");
    }
  });

  test("every spec issues the documented method and path", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { id: "ok" } }));
    for (const key of LEVER_ACTION_KEYS) {
      const spec = LEVER_ACTION_SPECS[key];
      await executeLeverAction(key, { ...sampleInput(spec), fetch: impl });
    }
    expect(calls).toHaveLength(LEVER_ACTION_KEYS.length);
    LEVER_ACTION_KEYS.forEach((key, index) => {
      const spec = LEVER_ACTION_SPECS[key];
      const url = new URL(calls[index].url);
      expect(calls[index].method).toBe(spec.method);
      expect(url.hostname).toBe("api.lever.co");
      const expectedPath = spec.path.replace(/\{[a-z0-9_]+\}/g, "[^/]+");
      expect(url.pathname).toMatch(new RegExp(`^/v1${expectedPath}$`));
    });
  });

  test("adds tags, sources, and links on the nested opportunity paths", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { tags: ["python"] } }));
    await executeLeverAction("opportunities.add_tags", {
      ...auth,
      opportunity: OPP,
      tags: ["python"],
      perform_as: USER,
      fetch: impl,
    });
    await executeLeverAction("opportunities.add_sources", {
      ...auth,
      opportunityId: OPP,
      sources: ["LinkedIn"],
      fetch: impl,
    });
    await executeLeverAction("opportunities.add_links", {
      ...auth,
      opportunity: OPP,
      links: ["https://github.com/ada"],
      fetch: impl,
    });

    expect(calls[0].method).toBe("POST");
    expect(new URL(calls[0].url).pathname).toBe(`/v1/opportunities/${OPP}/addTags`);
    expect(new URL(calls[0].url).searchParams.get("perform_as")).toBe(USER);
    expect(await calls[0].json()).toEqual({ tags: ["python"] });
    expect(new URL(calls[1].url).pathname).toBe(`/v1/opportunities/${OPP}/addSources`);
    expect(await calls[1].json()).toEqual({ sources: ["LinkedIn"] });
    expect(new URL(calls[2].url).pathname).toBe(`/v1/opportunities/${OPP}/addLinks`);
  });

  test("creates an opportunity with perform_as and emails for dedupe", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { id: OPP } }), { status: 201 });
    const result = await executeLeverAction("opportunities.create", {
      ...auth,
      name: "Ada Lovelace",
      emails: ["ada@example.com"],
      performAs: USER,
      parse: true,
      headline: "Mathematician",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(calls[0].method).toBe("POST");
    expect(url.pathname).toBe("/v1/opportunities");
    expect(url.searchParams.get("perform_as")).toBe(USER);
    expect(url.searchParams.get("parse")).toBe("true");
    expect(await calls[0].json()).toEqual({
      name: "Ada Lovelace",
      emails: ["ada@example.com"],
      headline: "Mathematician",
    });
    expect(result).toEqual({ data: { id: OPP } });
  });

  test("creates a note and forwards note_id as a query for threaded comments", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { id: "note-1" } }), { status: 201 });
    await executeLeverAction("notes.create", {
      ...auth,
      opportunity: OPP,
      value: "Follow up",
      note_id: "b1dbbcfe-281c-46a0-8f51-57049158d3f3",
      secret: true,
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(`/v1/opportunities/${OPP}/notes`);
    expect(url.searchParams.get("note_id")).toBe("b1dbbcfe-281c-46a0-8f51-57049158d3f3");
    expect(await calls[0].json()).toEqual({ value: "Follow up", secret: true });
  });

  test("deactivates and reactivates users on the documented POST paths", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { id: USER, deactivatedAt: 1 } }));
    await executeLeverAction("users.deactivate", { ...auth, user: USER, fetch: impl });
    await executeLeverAction("users.reactivate", { ...auth, user: USER, fetch: impl });
    expect(calls[0].method).toBe("POST");
    expect(new URL(calls[0].url).pathname).toBe(`/v1/users/${USER}/deactivate`);
    expect(calls[0].headers.get("content-type")).not.toBe("application/json");
    expect(new URL(calls[1].url).pathname).toBe(`/v1/users/${USER}/reactivate`);
  });

  test("deletes requisition field options with a JSON values body", async () => {
    const { calls, impl } = stubFetch("", { status: 204 });
    const result = await executeLeverAction("requisition_fields.delete_option", {
      ...auth,
      requisition_field: "work_type",
      values: ["5dc3d8e7-db49-44e5-99e9-fec13a305533"],
      fetch: impl,
    });
    expect(calls[0].method).toBe("DELETE");
    expect(new URL(calls[0].url).pathname).toBe("/v1/requisition_fields/work_type/options");
    expect(await calls[0].json()).toEqual({ values: ["5dc3d8e7-db49-44e5-99e9-fec13a305533"] });
    expect(result).toEqual({ ok: true });
  });

  test("maps Composio required to Lever isRequired on requisition field writes and lists", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { id: "work_type" } }));
    await executeLeverAction("requisition_fields.create", {
      ...auth,
      id: "work_type",
      text: "Work type",
      type: "dropdown",
      required: true,
      fetch: impl,
    });
    await executeLeverAction("requisition_fields.list", {
      ...auth,
      required: false,
      type: "dropdown",
      fetch: impl,
    });
    expect(await calls[0].json()).toEqual({
      id: "work_type",
      text: "Work type",
      type: "dropdown",
      isRequired: true,
    });
    expect(new URL(calls[1].url).searchParams.get("isRequired")).toBe("false");
    expect(new URL(calls[1].url).searchParams.get("type")).toBe("dropdown");
  });

  test("repeats include and expand query keys", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: [] }));
    await executeLeverAction("form_templates.list", {
      ...auth,
      include: ["text", "group"],
      expand: ["user"],
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/form_templates");
    expect(url.searchParams.getAll("include")).toEqual(["text", "group"]);
    expect(url.searchParams.getAll("expand")).toEqual(["user"]);
  });

  test("downloads a file without requiring JSON", async () => {
    const { calls, impl } = stubFetch("%PDF-1.4", {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });
    const result = await executeLeverAction("files.download", {
      ...auth,
      opportunity: OPP,
      file: "b02a3b97-dc41-48e3-b003-44d211ed2a4c",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe(
      `/v1/opportunities/${OPP}/files/b02a3b97-dc41-48e3-b003-44d211ed2a4c/download`,
    );
    expect(result).toEqual({ contentType: "application/pdf", body: "%PDF-1.4" });
  });

  test("uploads a temporary file and an opportunity file as multipart", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: { id: "up-1" } }), { status: 201 });
    await executeLeverAction("uploads.create", {
      ...auth,
      file_name: "resume.pdf",
      file_content: Buffer.from("hello").toString("base64"),
      file_mimetype: "application/pdf",
      fetch: impl,
    });
    await executeLeverAction("files.upload", {
      ...auth,
      opportunity: OPP,
      perform_as: USER,
      file_name: "cover.pdf",
      file_content: Buffer.from("cover").toString("base64"),
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe("/v1/uploads");
    expect(calls[0].headers.get("content-type")).toMatch(/^multipart\/form-data/);
    const form = await calls[0].formData();
    const uploaded = form.get("file");
    expect(uploaded).toBeInstanceOf(Blob);
    expect((uploaded as File).name).toBe("resume.pdf");
    expect(new URL(calls[1].url).pathname).toBe(`/v1/opportunities/${OPP}/files`);
    expect(new URL(calls[1].url).searchParams.get("perform_as")).toBe(USER);
  });

  test("lists tags and sources on account endpoints", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: [{ text: "python", count: 3 }] }));
    await executeLeverAction("tags.list", { ...auth, limit: 10, fetch: impl });
    await executeLeverAction("sources.list", { ...auth, offset: "cursor-1", fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/v1/tags");
    expect(new URL(calls[0].url).searchParams.get("limit")).toBe("10");
    expect(new URL(calls[1].url).pathname).toBe("/v1/sources");
    expect(new URL(calls[1].url).searchParams.get("offset")).toBe("cursor-1");
  });

  test("rejects missing required fields and unsafe path segments before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeLeverAction("notes.get", { ...auth, opportunity: OPP, fetch: impl })).rejects.toThrow(
      /note is required/i,
    );
    await expect(
      executeLeverAction("files.get", {
        ...auth,
        opportunity: "../evil",
        file: "abc",
        fetch: impl,
      }),
    ).rejects.toThrow(/letters, digits/);
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{\"message\":\"nope\"}", { status: 500 });
    await expect(
      executeLeverAction("tags.list", { ...auth, fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("uses the EU host when region is eu", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ data: [] }));
    await executeLeverAction("tags.list", { apiKey: "k", region: "eu", fetch: impl });
    expect(new URL(calls[0].url).hostname).toBe("api.lever.eu");
  });
});
