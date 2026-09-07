// Activepieces property descriptors -> JSON Schema.
//
// A piece action declares its inputs as `props`, each a Property descriptor
// carrying a displayName, description, and required flag. That is the same
// information an MCP tool's inputSchema needs, written by someone who knew the
// provider — which is the expensive half of authoring a connector operation.
//
// Display-only properties (Markdown) and properties whose shape is decided at
// runtime are handled explicitly rather than guessed at.

export type PropertyDescriptor = {
  type?: string;
  displayName?: string;
  description?: string;
  required?: boolean;
  options?: { options?: Array<{ label?: string; value?: unknown }> } | unknown;
  defaultValue?: unknown;
};

export type PropsSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
};

const jsonTypes: Record<string, string> = {
  SHORT_TEXT: "string",
  LONG_TEXT: "string",
  SECRET_TEXT: "string",
  DATE_TIME: "string",
  COLOR: "string",
  FILE: "string",
  NUMBER: "number",
  CHECKBOX: "boolean",
  JSON: "object",
  OBJECT: "object",
  DYNAMIC: "object",
  ARRAY: "array",
  DROPDOWN: "string",
  STATIC_DROPDOWN: "string",
  MULTI_SELECT_DROPDOWN: "array",
  STATIC_MULTI_SELECT_DROPDOWN: "array",
};

// displayOnly properties render text in the builder and carry no value, so they
// must not become tool inputs.
const displayOnly = new Set(["MARKDOWN"]);

export function propsToSchema(props: Record<string, PropertyDescriptor | undefined>): PropsSchema {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [name, descriptor] of Object.entries(props ?? {})) {
    if (!descriptor || typeof descriptor !== "object") {
      continue;
    }
    const type = String(descriptor.type ?? "SHORT_TEXT").toUpperCase();
    if (displayOnly.has(type)) {
      continue;
    }

    const property: Record<string, unknown> = { type: jsonTypes[type] ?? "string" };
    const enumValues = staticOptions(descriptor);
    if (enumValues.length > 0) {
      if (property.type === "array") {
        property.items = { type: "string", enum: enumValues };
      } else {
        property.enum = enumValues;
      }
    }
    if (property.type === "array" && property.items === undefined) {
      property.items = { type: "string" };
    }

    const description = describe(descriptor, type);
    if (description) {
      property.description = description;
    }
    properties[name] = property;

    if (descriptor.required === true) {
      required.push(name);
    }
  }

  return { type: "object", properties, ...(required.length > 0 ? { required } : {}) };
}

// describe prefers the property's own description and falls back to its display
// name, so a generated tool never ships an input with no explanation at all. A
// FILE property gets an explicit note because the declarative runtime sends
// JSON, not multipart.
function describe(descriptor: PropertyDescriptor, type: string): string | undefined {
  const parts: string[] = [];
  const description = typeof descriptor.description === "string" ? descriptor.description.trim() : "";
  const displayName = typeof descriptor.displayName === "string" ? descriptor.displayName.trim() : "";

  if (description) {
    parts.push(description);
  } else if (displayName) {
    parts.push(displayName.endsWith(".") ? displayName : `${displayName}.`);
  }
  if (type === "FILE") {
    parts.push("Supplied as a URL or base64 string.");
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function staticOptions(descriptor: PropertyDescriptor): string[] {
  const options = descriptor.options;
  if (typeof options !== "object" || options === null) {
    return [];
  }
  const list = (options as { options?: unknown }).options;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((option) => (typeof option === "object" && option !== null ? (option as { value?: unknown }).value : undefined))
    .filter((value): value is string => typeof value === "string");
}
