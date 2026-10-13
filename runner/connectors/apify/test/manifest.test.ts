import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("apify connector manifest", () => {
  test("declares key, name, runtime, version", () => {
    expect(manifest.key).toBe("apify");
    expect(manifest.name).toBe("Apify");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.auth.setup.fields[0].required).toBe(true);
    expect(manifest.auth.setup.fields[0].secret).toBe(true);
  });

  test("network allows api.apify.com only", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.apify.com"]);
  });

  test("categories include utility", () => {
    expect(manifest.categories).toContain("utility");
  });

  test("models include actor, run, dataset", () => {
    expect(manifest.models).toContain("actor");
    expect(manifest.models).toContain("run");
    expect(manifest.models).toContain("dataset");
    expect(manifest.models).toContain("task");
    expect(manifest.models).toContain("key-value-store");
    expect(manifest.models).toContain("webhook");
  });

  test("healthcheck is an action op", () => {
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
  });

  test("all action operations have title and description", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    const actionKeys = Object.keys(ops).filter((k) => ops[k].kind === "action");
    expect(actionKeys.length).toBeGreaterThan(0);
    for (const key of actionKeys) {
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    const actionKeys = Object.keys(ops).filter((k) => ops[k].kind === "action");
    for (const key of actionKeys) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema with required array", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const actionKeys = Object.keys(ops).filter((k) => ops[k].kind === "action");
    for (const key of actionKeys) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
      expect(Array.isArray(ops[key].inputSchema!.required)).toBe(true);
    }
  });

  test("declares actors.input_schema as a read action taking actorId", () => {
    const op = (manifest.operations as Record<string, any>)["actors.input_schema"];
    expect(op).toBeDefined();
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    expect(op.inputSchema.properties.actorId).toBeDefined();
    expect(op.inputSchema.required).toContain("actorId");
  });

  test("declares actors.options as a read action returning options[]", () => {
    const op = (manifest.operations as Record<string, any>)["actors.options"];
    expect(op).toBeDefined();
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    expect(op.inputSchema.properties.search).toBeDefined();
  });

  test("includes all expected action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    const expectedOps = [
      "healthcheck",
      "actors.list",
      "actors.get",
      "actor.run",
      "actor.run_sync_get_dataset_items",
      "runs.get",
      "runs.list",
      "runs.abort",
      "datasets.get",
      "datasets.items",
      "tasks.list",
      "task.run",
      "task.run_sync_get_dataset_items",
      "key_value_store.get_record",
      "datasets.list",
      "datasets.create",
      "datasets.delete",
      "datasets.push_items",
      "key_value_stores.list",
      "key_value_stores.get",
      "key_value_store.put_record",
      "key_value_store.list_keys",
      "key_value_store.delete_record",
      "tasks.get",
      "users.me",
      "webhooks.list",
      "runs.log",
      "request_queues.list",
    ];
    for (const key of expectedOps) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });

  test("actorId fields declare a dynamic-options source", () => {
    const ops = manifest.operations as Record<string, any>;
    for (const key of ["actor.run", "actor.run_sync_get_dataset_items", "runs.list"]) {
      const actorId = ops[key].inputSchema.properties.actorId;
      expect(actorId["x-dynamic-options"]).toMatchObject({
        source: "actors.options", valueField: "id", labelField: "label", searchParam: "search",
      });
    }
  });

  test("actorId dynamic-options declare a detailSource for runInput", () => {
    const ops = manifest.operations as Record<string, any>;
    for (const key of ["actor.run", "actor.run_sync_get_dataset_items", "runs.list"]) {
      expect(ops[key].inputSchema.properties.actorId["x-dynamic-options"].detailSource).toBe("actors.input_schema");
    }
  });

  test("declares http auth for compiled Composio operations", () => {
    const http = (manifest as { http: { baseUrl: string; auth: { field: string; value: string }; headers?: Record<string, string> } }).http;
    expect(http.baseUrl).toBe("https://api.apify.com");
    expect(http.auth.field).toBe("apiKey");
    expect(http.auth.value).toBe("Bearer {{apiKey}}");
    expect(http.headers?.Accept).toBe("application/json");
    expect(http.headers?.["Content-Type"]).toBeUndefined();
  });

  test("JSON Content-Type is declared only on operations that send a body", () => {
    const ops = manifest.operations as Record<string, {
      request?: { method?: string; body?: unknown; headers?: Record<string, string> };
    }>;
    for (const [key, op] of Object.entries(ops)) {
      const request = op.request;
      if (!request) continue;
      const method = (request.method ?? "GET").toUpperCase();
      const hasBody = request.body !== undefined;
      const contentType = request.headers?.["Content-Type"];
      if (hasBody) {
        expect(contentType, key).toBe("application/json");
        expect(["POST", "PUT", "PATCH", "DELETE"]).toContain(method);
        if (method === "DELETE") expect(key).toBe("request_queues.requests.batch_delete");
      } else {
        expect(contentType, key).toBeUndefined();
        if (method === "GET" || method === "HEAD" || method === "DELETE") {
          expect(request.body, key).toBeUndefined();
        }
      }
    }
  });

  test("new Composio operations include a request block, title, description, and object inputSchema", () => {
    const ops = manifest.operations as Record<string, { request?: unknown; title?: string; description?: string; inputSchema?: { type?: string } }>;
    const added = ["actors.create", "actors.update", "actors.delete", "actors.webhooks.list", "actors.versions.list", "actors.versions.create", "actors.versions.get", "actors.versions.update", "actors.versions.delete", "actors.versions.env_vars.list", "actors.versions.env_vars.create", "actors.versions.env_vars.get", "actors.versions.env_vars.update", "actors.versions.env_vars.delete", "actors.builds.create", "actors.builds.list", "actors.builds.default", "actors.runs.last", "actors.runs.last.dataset_items", "actor.run_sync", "actor.run_sync_get", "actor.run_sync_get_dataset_items_get", "actor_builds.list", "actor_builds.get", "actor_builds.delete", "actor_builds.abort", "actor_builds.log", "actor_builds.openapi", "runs.delete", "runs.update", "runs.resurrect", "runs.list_user", "runs.dataset_items", "runs.default_dataset", "runs.default_key_value_store", "runs.default_request_queue", "tasks.create", "tasks.update", "tasks.delete", "tasks.runs.last", "tasks.runs.last.dataset_items", "tasks.runs.list", "tasks.webhooks.list", "tasks.input.get", "tasks.input.update", "task.run_sync", "task.run_sync_get", "task.run_sync_get_dataset_items_post", "datasets.update", "datasets.statistics", "key_value_stores.create", "key_value_stores.delete", "key_value_stores.update", "key_value_store.head_record", "request_queues.create", "request_queues.get", "request_queues.update", "request_queues.delete", "request_queues.head", "request_queues.head.lock", "request_queues.requests.list", "request_queues.requests.add", "request_queues.requests.get", "request_queues.requests.update", "request_queues.requests.delete", "request_queues.requests.lock.delete", "request_queues.requests.lock.prolong", "request_queues.requests.batch_add", "request_queues.requests.batch_delete", "request_queues.requests.unlock", "schedules.list", "schedules.create", "schedules.get", "schedules.update", "schedules.delete", "schedules.log", "webhooks.create", "webhooks.get", "webhooks.update", "webhooks.delete", "webhooks.test", "webhooks.dispatches.list", "webhook_dispatches.list", "webhook_dispatches.get", "users.get", "users.me.limits.get", "users.me.limits.update", "users.me.usage.monthly", "store.list", "discover.g2_products", "reports.carfax_by_vin", "reports.us_fuel_price_averages", "scrape.amazon_product_details", "scrape.amazon_reviews", "scrape.booking_reviews", "scrape.facebook_ads", "scrape.facebook_comments", "scrape.facebook_events", "scrape.facebook_group_posts", "scrape.facebook_pages", "scrape.facebook_photos", "scrape.facebook_posts", "scrape.facebook_reels", "scrape.facebook_reviews", "scrape.g2_reviews", "scrape.google_maps_places", "scrape.google_maps_reviews", "scrape.indeed_jobs", "scrape.instagram_comments", "scrape.instagram_hashtags", "scrape.instagram_mentions", "scrape.instagram_posts", "scrape.instagram_profiles", "scrape.instagram_reels", "scrape.linkedin_companies", "scrape.linkedin_company_employees", "scrape.linkedin_profile_posts", "scrape.linkedin_profiles", "scrape.snapchat_profiles", "scrape.snapchat_spotlight", "scrape.tik_tok_ads", "scrape.tik_tok_comments", "scrape.tik_tok_posts", "scrape.tik_tok_video", "scrape.tripadvisor_reviews", "scrape.trustpilot_reviews", "scrape.twitter_posts", "scrape.website_traffic_insights", "scrape.yelp_reviews", "scrape.youtube_comments", "scrape.youtube_videos", "scrape.youtube_video_transcripts", "scrape.zillow_property_details", "search.aliexpress_products", "search.amazon_products", "search.booking_properties", "search.eventbrite_events", "search.facebook_marketplace", "search.google", "search.google_images", "search.google_news", "search.google_shopping", "search.instagram", "search.jobs_across_sites", "search.linkedin_companies", "search.linkedin_jobs", "search.linkedin_posts", "search.linkedin_profiles", "search.linkedin_profiles_by_name", "search.linkedin_profiles_by_services", "search.local_fuel_prices", "search.tik_tok_users", "search.tripadvisor_places", "search.upwork_jobs", "search.yandex_market_products", "search.zillow_properties"];
    for (const key of added) {
      expect(ops[key], key).toBeDefined();
      expect(ops[key].request, key).toBeDefined();
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect(ops[key].inputSchema?.type).toBe("object");
    }
  });
});
