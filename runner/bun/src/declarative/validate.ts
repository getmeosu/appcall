// Input validation derived from an operation's JSON Schema.
//
// Hand-written connectors each carry a `validateXInput` function that repeats
// what the manifest's `inputSchema` already declares. A declarative operation
// has no such function: the schema IS the validator, so the two can never drift
// and the MCP tool contract is exactly what the runner enforces.
//
// The subset covered is deliberately small — the shape real connector inputs
// take: `type` (single or union), `required`, and `enum`. Anything richer stays
// the provider's job to reject, surfaced as CONNECTOR_UPSTREAM_ERROR.

import { isRecord } from "./template";

export type JSONSchema = Record<string, unknown>;

export function validateAgainstSchema(input: unknown, schema: JSONSchema): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error("input must be an object");
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];

  for (const key of required) {
    if (isAbsent(input[key])) {
      throw new Error(`${key} is required`);
    }
  }

  const validated: Record<string, unknown> = {};
  for (const [key, rawProperty] of Object.entries(properties)) {
    const value = input[key];
    if (isAbsent(value)) {
      continue;
    }
    const property = isRecord(rawProperty) ? rawProperty : {};
    assertType(key, value, property);
    assertEnum(key, value, property);
    validated[key] = value;
  }

  return validated;
}

// isAbsent treats undefined, null, and "" alike: a provider call built from an
// empty string is a bug, not a request, and required-field errors read better
// than the 400 the provider would return.
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function assertType(key: string, value: unknown, property: JSONSchema): void {
  const types = declaredTypes(property);
  if (types.length === 0) {
    return;
  }
  if (types.some((type) => matchesType(value, type))) {
    return;
  }
  throw new Error(`${key} must be ${describeTypes(types)}`);
}

function assertEnum(key: string, value: unknown, property: JSONSchema): void {
  if (!Array.isArray(property.enum) || property.enum.length === 0) {
    return;
  }
  if (property.enum.includes(value)) {
    return;
  }
  throw new Error(`${key} must be one of: ${property.enum.map((option) => String(option)).join(", ")}`);
}

function declaredTypes(property: JSONSchema): string[] {
  if (typeof property.type === "string") {
    return [property.type];
  }
  if (Array.isArray(property.type)) {
    return property.type.filter((type): type is string => typeof type === "string");
  }
  return [];
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function describeTypes(types: string[]): string {
  return types.map((type) => `${article(type)} ${type}`).join(" or ");
}

function article(type: string): string {
  return type === "array" || type === "integer" || type === "object" ? "an" : "a";
}

export function assertOutputSchema(value: unknown, schema: JSONSchema, depth = 0): void {
  if (depth > 64) throw new Error("Schema nesting exceeds limit");
  assertType("response", value, schema);
  assertEnum("response", value, schema);
  if (typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) throw new Error("String too short");
  if (isRecord(value)) {
    const properties=isRecord(schema.properties)?schema.properties:{};
    for(const key of Array.isArray(schema.required)?schema.required:[]) if(typeof key === "string" && value[key] === undefined) throw new Error("Missing property");
    for(const [key, child] of Object.entries(value)) {
      if(isRecord(properties[key])) assertOutputSchema(child, properties[key],depth+1);
      else if(schema.additionalProperties===false) throw new Error("Unexpected property");
    }
  }
  if(Array.isArray(value) && isRecord(schema.items)) for(const item of value)assertOutputSchema(item,schema.items,depth+1);
}
