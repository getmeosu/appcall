import { isRecord, readPageSize, requireNonEmptyString } from "./http";

export type DatabasesGetInput = {
  databaseId: string;
};

export type DatabaseItemsQueryInput = {
  databaseId: string;
  filters?: DatabaseItemFilter[];
  cursor?: string;
  pageSize?: number;
};

export type DatabaseItemsGetInput = {
  pageId: string;
};

export type DatabaseItemsCreateInput = {
  databaseId: string;
  properties: Record<string, DatabaseItemPropertyInput>;
  content?: string;
};

export type DatabaseItemsUpdateInput = {
  pageId: string;
  properties: Record<string, DatabaseItemPropertyInput>;
};

export type DatabaseItemFilter = {
  property: string;
  type: DatabaseItemPropertyType;
  equals?: string | number | boolean;
  contains?: string;
};

export type DatabaseItemPropertyInput = {
  type: DatabaseItemPropertyType;
  value: string | number | boolean | string[];
};

export type DatabaseItemPropertyType =
  | "checkbox"
  | "date"
  | "email"
  | "multi_select"
  | "number"
  | "people"
  | "phone_number"
  | "rich_text"
  | "select"
  | "status"
  | "title"
  | "url";

export type NormalizedDatabase = {
  id: string;
  providerId: string;
  title: string;
  description: string;
  url?: string;
  properties: Record<string, {
    id: string;
    name: string;
    type: string;
    description: string;
  }>;
  propertyTypes: Record<string, string>;
  selectOptions: Record<string, SelectOption[]>;
  statusOptions: Record<string, {
    options: SelectOption[];
    groups: Array<{ id: string; name: string; color: string; optionIds: string[] }>;
  }>;
  relationConfig: Record<string, {
    databaseId?: string;
    syncedPropertyId?: string;
    syncedPropertyName?: string;
  }>;
  numberConfig: Record<string, { format?: string }>;
  raw: Record<string, unknown>;
};

export type DatabaseSummary = {
  title: string;
  totalProperties: number;
  propertyTypes: Record<string, number>;
};

type SelectOption = {
  id: string;
  name: string;
  color: string;
};

export function validateDatabasesGetInput(input: unknown): DatabasesGetInput {
  if (!isRecord(input)) {
    throw new Error("databases get input must be an object");
  }
  const databaseId = requireNonEmptyString(input.databaseId, "databaseId");
  return { databaseId };
}

export function validateDatabaseItemsQueryInput(input: unknown): DatabaseItemsQueryInput {
  if (!isRecord(input)) {
    throw new Error("database items query input must be an object");
  }
  const databaseId = requireNonEmptyString(input.databaseId, "databaseId");
  const cursor = typeof input.cursor === "string" && input.cursor.trim().length > 0 ? input.cursor.trim() : undefined;
  const pageSize = input.pageSize === undefined ? undefined : readPageSize(input.pageSize);
  const filters = input.filters === undefined ? undefined : readDatabaseItemFilters(input.filters);
  return { databaseId, filters, cursor, pageSize };
}

export function validateDatabaseItemsGetInput(input: unknown): DatabaseItemsGetInput {
  if (!isRecord(input)) {
    throw new Error("database items get input must be an object");
  }
  const pageId = requireNonEmptyString(input.pageId, "pageId");
  return { pageId };
}

export function validateDatabaseItemsCreateInput(input: unknown): DatabaseItemsCreateInput {
  if (!isRecord(input)) {
    throw new Error("database items create input must be an object");
  }
  const databaseId = requireNonEmptyString(input.databaseId, "databaseId");
  if (!isRecord(input.properties) || Object.keys(input.properties).length === 0) {
    throw new Error("properties must include at least one Notion property");
  }
  const properties = Object.entries(input.properties).reduce((acc: Record<string, DatabaseItemPropertyInput>, [property, value]) => {
    acc[property] = readDatabaseItemPropertyInput(value);
    return acc;
  }, {});
  const content = typeof input.content === "string" && input.content.trim().length > 0 ? input.content.trim() : undefined;
  if (content && content.length > 2000) {
    throw new Error("content exceeds Notion paragraph limit");
  }
  return { databaseId, properties, content };
}

export function validateDatabaseItemsUpdateInput(input: unknown): DatabaseItemsUpdateInput {
  if (!isRecord(input)) {
    throw new Error("database items update input must be an object");
  }
  const pageId = requireNonEmptyString(input.pageId, "pageId");
  if (!isRecord(input.properties) || Object.keys(input.properties).length === 0) {
    throw new Error("properties must include at least one Notion property");
  }
  const properties = Object.entries(input.properties).reduce((acc: Record<string, DatabaseItemPropertyInput>, [property, value]) => {
    acc[property] = readDatabaseItemPropertyInput(value);
    return acc;
  }, {});
  return { pageId, properties };
}

export function buildDatabaseItemsQueryPayload(input: DatabaseItemsQueryInput): Record<string, unknown> {
  return {
    ...(input.cursor ? { start_cursor: input.cursor } : {}),
    ...(typeof input.pageSize === "number" ? { page_size: input.pageSize } : {}),
    ...(input.filters && input.filters.length > 0 ? { filter: { and: input.filters.map(buildDatabaseItemFilter) } } : {}),
  };
}

export function buildDatabaseItemCreatePayload(input: DatabaseItemsCreateInput): Record<string, unknown> {
  return {
    parent: {
      type: "database_id",
      database_id: input.databaseId,
    },
    properties: buildDatabaseItemPropertiesPayload(input.properties),
    children: input.content ? [{
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{
          type: "text",
          text: {
            content: input.content,
          },
        }],
      },
    }] : [],
  };
}

export function buildDatabaseItemUpdatePayload(input: DatabaseItemsUpdateInput): Record<string, unknown> {
  return {
    properties: buildDatabaseItemPropertiesPayload(input.properties),
  };
}

export function normalizeDatabase(input: Record<string, unknown>): NormalizedDatabase {
  const id = requireNonEmptyString(input.id, "database.id");
  const properties = isRecord(input.properties) ? input.properties : {};
  const normalizedProperties: NormalizedDatabase["properties"] = {};
  const propertyTypes: Record<string, string> = {};
  const selectOptions: NormalizedDatabase["selectOptions"] = {};
  const statusOptions: NormalizedDatabase["statusOptions"] = {};
  const relationConfig: NormalizedDatabase["relationConfig"] = {};
  const numberConfig: NormalizedDatabase["numberConfig"] = {};

  for (const [key, propertyValue] of Object.entries(properties)) {
    if (!isRecord(propertyValue)) {
      continue;
    }
    const type = typeof propertyValue.type === "string" ? propertyValue.type : "unknown";
    normalizedProperties[key] = {
      id: typeof propertyValue.id === "string" ? propertyValue.id : key,
      name: typeof propertyValue.name === "string" ? propertyValue.name : key,
      type,
      description: typeof propertyValue.description === "string" ? propertyValue.description : "",
    };
    propertyTypes[key] = type;

    if (type === "select" && isRecord(propertyValue.select) && Array.isArray(propertyValue.select.options)) {
      selectOptions[key] = propertyValue.select.options.map(normalizeSelectOption).filter((option): option is SelectOption => option !== null);
    }
    if (type === "multi_select" && isRecord(propertyValue.multi_select) && Array.isArray(propertyValue.multi_select.options)) {
      selectOptions[key] = propertyValue.multi_select.options.map(normalizeSelectOption).filter((option): option is SelectOption => option !== null);
    }
    if (type === "status" && isRecord(propertyValue.status)) {
      const options = Array.isArray(propertyValue.status.options)
        ? propertyValue.status.options.map(normalizeSelectOption).filter((option): option is SelectOption => option !== null)
        : [];
      const groups = Array.isArray(propertyValue.status.groups)
        ? propertyValue.status.groups.map(normalizeStatusGroup).filter((group): group is { id: string; name: string; color: string; optionIds: string[] } => group !== null)
        : [];
      statusOptions[key] = { options, groups };
    }
    if (type === "relation" && isRecord(propertyValue.relation)) {
      relationConfig[key] = {
        databaseId: typeof propertyValue.relation.database_id === "string" ? propertyValue.relation.database_id : undefined,
        syncedPropertyId: typeof propertyValue.relation.synced_property_id === "string" ? propertyValue.relation.synced_property_id : undefined,
        syncedPropertyName: typeof propertyValue.relation.synced_property_name === "string" ? propertyValue.relation.synced_property_name : undefined,
      };
    }
    if (type === "number" && isRecord(propertyValue.number)) {
      numberConfig[key] = {
        format: typeof propertyValue.number.format === "string" ? propertyValue.number.format : undefined,
      };
    }
  }

  return {
    id: `notion:${id}`,
    providerId: id,
    title: readRichTextPlain(input.title),
    description: readRichTextPlain(input.description),
    url: typeof input.url === "string" ? input.url : undefined,
    properties: normalizedProperties,
    propertyTypes,
    selectOptions,
    statusOptions,
    relationConfig,
    numberConfig,
    raw: input,
  };
}

export function summarizeDatabase(database: NormalizedDatabase): DatabaseSummary {
  const propertyTypes = Object.values(database.propertyTypes).reduce((acc: Record<string, number>, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  return {
    title: database.title || "Untitled Database",
    totalProperties: Object.keys(database.properties).length,
    propertyTypes,
  };
}

function buildDatabaseItemPropertiesPayload(properties: Record<string, DatabaseItemPropertyInput>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).map(([property, value]) => [
    property,
    buildDatabaseItemProperty(value),
  ]));
}

function readDatabaseItemPropertyInput(value: unknown): DatabaseItemPropertyInput {
  if (!isRecord(value)) {
    throw new Error("database item property must be an object");
  }
  const type = requireDatabaseFilterType(value.type);
  if (Array.isArray(value.value)) {
    const values = value.value.map((item) => requireNonEmptyString(item, "property.value"));
    return { type, value: values };
  }
  const propertyValue = readFilterPrimitive(value.value, "value");
  if (propertyValue === undefined) {
    throw new Error("property.value is required");
  }
  return { type, value: propertyValue };
}

function readDatabaseItemFilters(value: unknown): DatabaseItemFilter[] {
  if (!Array.isArray(value)) {
    throw new Error("filters must be an array");
  }
  if (value.length > 20) {
    throw new Error("filters cannot exceed 20 items");
  }
  return value.map(readDatabaseItemFilter);
}

function readDatabaseItemFilter(value: unknown): DatabaseItemFilter {
  if (!isRecord(value)) {
    throw new Error("filter must be an object");
  }
  const property = requireNonEmptyString(value.property, "filter.property");
  const type = requireDatabaseFilterType(value.type);
  const equals = readFilterPrimitive(value.equals, "equals");
  const contains = value.contains === undefined ? undefined : requireNonEmptyString(value.contains, "filter.contains");
  if (equals === undefined && contains === undefined) {
    throw new Error("filter must include equals or contains");
  }
  return { property, type, equals, contains };
}

function requireDatabaseFilterType(value: unknown): DatabaseItemPropertyType {
  const allowed = new Set([
    "checkbox",
    "date",
    "email",
    "multi_select",
    "number",
    "people",
    "phone_number",
    "rich_text",
    "select",
    "status",
    "title",
    "url",
  ]);
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error("filter.type is not supported");
  }
  return value as DatabaseItemPropertyType;
}

function readFilterPrimitive(value: unknown, field: string): string | number | boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new Error(`filter.${field} must be a string, number, or boolean`);
}

function buildDatabaseItemFilter(filter: DatabaseItemFilter): Record<string, unknown> {
  if (filter.type === "multi_select") {
    return {
      property: filter.property,
      multi_select: { contains: requireFilterText(filter.contains ?? filter.equals, filter.property) },
    };
  }
  if (filter.type === "people") {
    return {
      property: filter.property,
      people: { contains: requireFilterText(filter.contains ?? filter.equals, filter.property) },
    };
  }
  return {
    property: filter.property,
    [filter.type]: { equals: filter.equals },
  };
}

function buildDatabaseItemProperty(input: DatabaseItemPropertyInput): Record<string, unknown> {
  switch (input.type) {
    case "checkbox":
      return { checkbox: input.value === true };
    case "date":
      return { date: { start: requirePropertyString(input.value, "date") } };
    case "email":
      return { email: requirePropertyString(input.value, "email") };
    case "multi_select":
      return { multi_select: requirePropertyStringArray(input.value, "multi_select").map((name) => ({ name })) };
    case "number":
      if (typeof input.value !== "number" || !Number.isFinite(input.value)) {
        throw new Error("number property requires a finite number");
      }
      return { number: input.value };
    case "people":
      return { people: requirePropertyStringArray(input.value, "people").map((id) => ({ id })) };
    case "phone_number":
      return { phone_number: requirePropertyString(input.value, "phone_number") };
    case "rich_text":
      return { rich_text: [{ text: { content: requirePropertyString(input.value, "rich_text") } }] };
    case "select":
      return { select: { name: requirePropertyString(input.value, "select") } };
    case "status":
      return { status: { name: requirePropertyString(input.value, "status") } };
    case "title":
      return { title: [{ text: { content: requirePropertyString(input.value, "title") } }] };
    case "url":
      return { url: requirePropertyString(input.value, "url") };
  }
}

function requirePropertyString(value: unknown, type: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${type} property requires a non-empty string`);
  }
  return value.trim();
}

function requirePropertyStringArray(value: unknown, type: string): string[] {
  if (typeof value === "string") {
    return [requirePropertyString(value, type)];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${type} property requires a string array`);
  }
  return value.map((item) => requirePropertyString(item, type));
}

function requireFilterText(value: unknown, property: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${property} filter requires a non-empty string`);
  }
  return value.trim();
}

function normalizeSelectOption(input: unknown): SelectOption | null {
  if (!isRecord(input) || typeof input.id !== "string" || typeof input.name !== "string") {
    return null;
  }
  return {
    id: input.id,
    name: input.name,
    color: typeof input.color === "string" ? input.color : "default",
  };
}

function normalizeStatusGroup(input: unknown): { id: string; name: string; color: string; optionIds: string[] } | null {
  if (!isRecord(input) || typeof input.id !== "string" || typeof input.name !== "string") {
    return null;
  }
  return {
    id: input.id,
    name: input.name,
    color: typeof input.color === "string" ? input.color : "default",
    optionIds: Array.isArray(input.option_ids) ? input.option_ids.filter((value): value is string => typeof value === "string") : [],
  };
}

function readRichTextPlain(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value.map((item) => isRecord(item) && typeof item.plain_text === "string" ? item.plain_text : "").join("").trim();
}
