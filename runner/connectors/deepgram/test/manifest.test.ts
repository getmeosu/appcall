import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/deepgram/recipe.json";

const ADDED = [
  "balances.get",
  "billing.breakdown",
  "usage.breakdown",
  "billing.fields",
  "purchases.list",
  "listen.prerecorded",
];

const USAGE_QUERIES = [
  "start",
  "end",
  "grouping",
  "accessor",
  "alternatives",
  "callback_method",
  "callback",
  "channels",
  "custom_intent_mode",
  "custom_intent",
  "custom_topic_mode",
  "custom_topic",
  "deployment",
  "detect_entities",
  "detect_language",
  "diarize",
  "dictation",
  "encoding",
  "endpoint",
  "extra",
  "filler_words",
  "intents",
  "keyterm",
  "keywords",
  "language",
  "measurements",
  "method",
  "model",
  "multichannel",
  "numerals",
  "paragraphs",
  "profanity_filter",
  "punctuate",
  "redact",
  "replace",
  "sample_rate",
  "search",
  "sentiment",
  "smart_format",
  "summarize",
  "tag",
  "topics",
  "utt_split",
  "utterances",
  "version",
];

const USAGE_BOOLEANS = [
  "alternatives",
  "callback_method",
  "callback",
  "channels",
  "custom_intent_mode",
  "custom_intent",
  "custom_topic_mode",
  "custom_topic",
  "detect_entities",
  "detect_language",
  "diarize",
  "dictation",
  "encoding",
  "extra",
  "filler_words",
  "intents",
  "keyterm",
  "keywords",
  "language",
  "measurements",
  "multichannel",
  "numerals",
  "paragraphs",
  "profanity_filter",
  "punctuate",
  "redact",
  "replace",
  "sample_rate",
  "search",
  "sentiment",
  "smart_format",
  "summarize",
  "topics",
  "utt_split",
  "utterances",
  "version",
];

const LISTEN_QUERIES = [
  "callback",
  "callback_method",
  "extra",
  "sentiment",
  "summarize",
  "tag",
  "topics",
  "custom_topic",
  "custom_topic_mode",
  "intents",
  "custom_intent",
  "custom_intent_mode",
  "detect_entities",
  "detect_language",
  "diarize",
  "diarize_model",
  "dictation",
  "encoding",
  "filler_words",
  "keyterm",
  "keywords",
  "language",
  "measurements",
  "model",
  "multichannel",
  "numerals",
  "paragraphs",
  "profanity_filter",
  "punctuate",
  "redact",
  "replace",
  "search",
  "smart_format",
  "utterances",
  "utt_split",
  "version",
  "mip_opt_out",
];

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(Object.keys(manifest.operations)).toHaveLength(28);
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect(manifest.network?.allowedHosts).toEqual(["api.deepgram.com"]);
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      expect(op.sideEffect).toBe("read");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    const destructive = /delete|withdraw|remove/.test(key);
    const write = /create|update|add|duplicate|move|send|resend|resolve/.test(key) || key === "listen.prerecorded";
    expect(op.sideEffect).toBe(destructive ? "destructive" : write ? "write" : "read");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});

it("adds six public JSON operations absent from the origin recipe", () => {
  expect(manifest.http.baseUrl).toBe("https://api.deepgram.com/v1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Token {{apiKey}}",
  });
  expect(JSON.stringify(manifest)).not.toContain("agent.deepgram.com");
  expect(manifest.operations["speak.generate"]).toBeUndefined();
  expect(manifest.operations["scopes.get"].request.path).toBe("/projects/{{projectId}}/members/{{memberId}}/scopes");

  const recipeKeys = Object.keys(recipe.operationSources).sort();
  expect(recipeKeys).toHaveLength(22);
  expect(recipeKeys).toEqual([...recipe.selection.operations].sort());
  expect(Object.keys(recipe.manifest.operations).sort()).toEqual(recipeKeys);
  const absent = Object.keys(manifest.operations).filter((key) => !recipeKeys.includes(key)).sort();
  expect(absent).toEqual([...ADDED].sort());

  const output = manifest.operations["usage.get"].outputSchema;
  for (const key of ADDED) {
    const op = manifest.operations[key];
    expect(op.request.baseUrl).toBeUndefined();
    expect(op.request.success).toEqual([200]);
    expect(op.timeoutMs).toBe(15000);
    expect(op.maxInputBytes).toBe(65536);
    expect(op.maxResponseBytes).toBe(5242880);
    expect(op.outputSchema).toEqual(output);
    expect(op.inputSchema.additionalProperties).toBe(false);
    const query = op.request.query ?? {};
    for (const [name, template] of Object.entries(query)) {
      expect(template).toBe(`{{${name}}}`);
      expect(op.inputSchema.properties[name]).toBeDefined();
    }
  }

  const balances = manifest.operations["balances.get"];
  expect(balances.request.method).toBe("GET");
  expect(balances.request.path).toBe("/projects/{{projectId}}/balances/{{balanceId}}");
  expect(balances.request.body).toBeUndefined();
  expect(balances.request.headers).toBeUndefined();
  expect(balances.request.query).toBeUndefined();
  expect(balances.inputSchema.required).toEqual(["projectId", "balanceId"]);

  const billing = manifest.operations["billing.breakdown"];
  expect(billing.request.method).toBe("GET");
  expect(billing.request.path).toBe("/projects/{{projectId}}/billing/breakdown");
  expect(billing.request.body).toBeUndefined();
  expect(billing.request.headers).toBeUndefined();
  expect(Object.keys(billing.request.query)).toEqual(["start", "end", "accessor", "deployment", "tag", "line_item", "grouping"]);
  expect(billing.inputSchema.properties.grouping.type).toBe("array");
  expect(billing.inputSchema.properties.grouping.items.enum).toEqual(["accessor", "deployment", "line_item", "tags"]);
  expect(billing.inputSchema.properties.deployment.enum).toEqual(["hosted", "beta", "self-hosted"]);
  expect(billing.inputSchema.required).toEqual(["projectId"]);

  const usage = manifest.operations["usage.breakdown"];
  expect(usage.request.method).toBe("GET");
  expect(usage.request.path).toBe("/projects/{{projectId}}/usage/breakdown");
  expect(usage.request.body).toBeUndefined();
  expect(usage.request.headers).toBeUndefined();
  expect(Object.keys(usage.request.query)).toEqual(USAGE_QUERIES);
  expect(usage.inputSchema.properties.grouping.type).toBe("string");
  expect(usage.inputSchema.properties.grouping.enum).toEqual(["accessor", "endpoint", "feature_set", "models", "method", "tags", "deployment"]);
  expect(usage.inputSchema.properties.endpoint.enum).toEqual(["listen", "read", "speak", "agent"]);
  expect(usage.inputSchema.properties.method.enum).toEqual(["sync", "async", "streaming"]);
  for (const name of USAGE_BOOLEANS) expect(usage.inputSchema.properties[name].type).toBe("boolean");
  expect(usage.inputSchema.required).toEqual(["projectId"]);

  const fields = manifest.operations["billing.fields"];
  expect(fields.request.method).toBe("GET");
  expect(fields.request.path).toBe("/projects/{{projectId}}/billing/fields");
  expect(fields.request.body).toBeUndefined();
  expect(fields.request.headers).toBeUndefined();
  expect(Object.keys(fields.request.query)).toEqual(["start", "end"]);
  expect(fields.inputSchema.required).toEqual(["projectId"]);

  const purchases = manifest.operations["purchases.list"];
  expect(purchases.request.method).toBe("GET");
  expect(purchases.request.path).toBe("/projects/{{projectId}}/purchases");
  expect(purchases.request.body).toBeUndefined();
  expect(purchases.request.headers).toBeUndefined();
  expect(Object.keys(purchases.request.query)).toEqual(["limit"]);
  expect(purchases.inputSchema.properties.limit.type).toBe("number");
  expect(purchases.inputSchema.required).toEqual(["projectId"]);

  const listen = manifest.operations["listen.prerecorded"];
  expect(listen.sideEffect).toBe("write");
  expect(listen.request.method).toBe("POST");
  expect(listen.request.path).toBe("/listen");
  expect(listen.request.headers).toEqual({ "Content-Type": "application/json" });
  expect(listen.request.body).toEqual({ url: "{{url}}" });
  expect(Object.keys(listen.request.query)).toEqual(LISTEN_QUERIES);
  expect(listen.request.query.sample_rate).toBeUndefined();
  expect(listen.request.query.channels).toBeUndefined();
  expect(listen.inputSchema.required).toEqual(["url"]);
  expect(listen.inputSchema.properties.url.type).toBe("string");
  expect(listen.inputSchema.properties.keyterm.type).toBe("array");
  expect(listen.inputSchema.properties.utt_split.type).toBe("number");
  expect(listen.inputSchema.properties.sentiment.type).toBe("boolean");
  expect(listen.inputSchema.properties.mip_opt_out.type).toBe("boolean");
  expect(listen.inputSchema.properties.callback_method.enum).toEqual(["POST", "PUT"]);
  expect(listen.inputSchema.properties.encoding.enum).toEqual(["linear16", "flac", "mulaw", "amr-nb", "amr-wb", "opus", "speex", "g729"]);
  expect(listen.inputSchema.properties.diarize_model.enum).toEqual(["latest", "v1", "v2"]);
  expect(listen.inputSchema.properties.extra.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.keywords.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.tag.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.custom_topic.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.custom_intent.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.replace.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.search.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
  expect(listen.inputSchema.properties.summarize.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "boolean"]);
  expect(listen.inputSchema.properties.detect_language.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["boolean", "array"]);
  expect(listen.inputSchema.properties.redact.oneOf.map((branch: { type: string }) => branch.type)).toEqual(["string", "array"]);
});
