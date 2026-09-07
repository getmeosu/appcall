import { describe, expect, it } from "bun:test";
import { propsToSchema } from "../props";

describe("propsToSchema", () => {
  it("maps property types onto the JSON Schema subset the runner validates", () => {
    const schema = propsToSchema({
      subject: { type: "SHORT_TEXT", displayName: "Subject", required: true },
      body: { type: "LONG_TEXT", displayName: "Body", description: "The message body.", required: false },
      count: { type: "NUMBER", displayName: "Count", required: false },
      draft: { type: "CHECKBOX", displayName: "Draft", required: false },
      meta: { type: "OBJECT", displayName: "Meta", required: false },
      tags: { type: "ARRAY", displayName: "Tags", required: false },
    });

    expect(schema.type).toBe("object");
    expect(schema.properties.subject).toEqual({ type: "string", description: "Subject." });
    expect(schema.properties.body).toEqual({ type: "string", description: "The message body." });
    expect(schema.properties.count!.type).toBe("number");
    expect(schema.properties.draft!.type).toBe("boolean");
    expect(schema.properties.meta!.type).toBe("object");
    expect(schema.properties.tags).toEqual({ type: "array", items: { type: "string" }, description: "Tags." });
    expect(schema.required).toEqual(["subject"]);
  });

  it("omits required entirely when nothing is required", () => {
    expect(propsToSchema({ a: { type: "SHORT_TEXT" } }).required).toBeUndefined();
  });

  it("drops display-only markdown properties", () => {
    const schema = propsToSchema({ note: { type: "MARKDOWN" }, real: { type: "SHORT_TEXT", required: true } });
    expect(Object.keys(schema.properties)).toEqual(["real"]);
    expect(schema.required).toEqual(["real"]);
  });

  it("lifts static dropdown options into an enum", () => {
    const schema = propsToSchema({
      priority: {
        type: "STATIC_DROPDOWN",
        displayName: "Priority",
        required: true,
        options: { options: [{ label: "Low", value: "low" }, { label: "High", value: "high" }] },
      },
    });
    expect(schema.properties.priority!.enum).toEqual(["low", "high"]);
    expect(schema.properties.priority!.type).toBe("string");
  });

  it("puts multi-select options on the array items", () => {
    const schema = propsToSchema({
      labels: {
        type: "STATIC_MULTI_SELECT_DROPDOWN",
        options: { options: [{ value: "a" }, { value: "b" }] },
      },
    });
    expect(schema.properties.labels).toEqual({ type: "array", items: { type: "string", enum: ["a", "b"] } });
  });

  it("ignores a dynamic dropdown's option loader", () => {
    const schema = propsToSchema({
      boardId: { type: "DROPDOWN", displayName: "Board", required: true, options: async () => ({ options: [] }) },
    });
    expect(schema.properties.boardId).toEqual({ type: "string", description: "Board." });
  });

  it("notes how a file property must be supplied", () => {
    const schema = propsToSchema({ attachment: { type: "FILE", displayName: "Attachment" } });
    expect(schema.properties.attachment!.description).toBe("Attachment. Supplied as a URL or base64 string.");
  });

  it("skips a property whose descriptor is missing", () => {
    expect(Object.keys(propsToSchema({ gone: undefined, kept: { type: "NUMBER" } }).properties)).toEqual(["kept"]);
  });
});
