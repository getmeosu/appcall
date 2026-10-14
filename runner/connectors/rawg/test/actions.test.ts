import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

type Operation = {
  kind?: string;
  sideEffect?: string;
  validationMode?: string;
  responseFormat?: string;
  enforceOutputSchema?: boolean;
  title?: string;
  description?: string;
  inputSchema?: {
    additionalProperties?: boolean;
    properties?: Record<string, { maximum?: number; minLength?: number; type?: string }>;
    required?: string[];
  };
  outputSchema?: { required?: string[] };
  request?: {
    method?: string;
    path?: string;
    success?: number[];
    query?: Record<string, string>;
    body?: unknown;
  };
};

const operations = manifest.operations as Record<string, Operation>;

const declarativeActionKeys = Object.entries(operations)
  .filter(([, operation]) => operation.kind === "action" && operation.request !== undefined)
  .map(([key]) => key);

// The 23 Composio missing_http rows, verified against the official RAWG OpenAPI
// (https://api.rawg.io/docs/?format=openapi): every one is a public GET route
// whose documented success response is HTTP 200 and a JSON object.
const BACKLOG: Record<string, { path: string; query?: string[] }> = {
  "creators.list": { path: "/creators", query: ["page", "page_size"] },
  "creators.get": { path: "/creators/{{id}}" },
  "creatorRoles.list": { path: "/creator-roles", query: ["page", "page_size"] },
  "developers.list": { path: "/developers", query: ["page", "page_size"] },
  "developers.get": { path: "/developers/{{id}}" },
  "games.achievements": { path: "/games/{{gameId}}/achievements" },
  "games.additions": { path: "/games/{{gameId}}/additions", query: ["page", "page_size"] },
  "games.developmentTeam": {
    path: "/games/{{gameId}}/development-team",
    query: ["ordering", "page", "page_size"],
  },
  "games.gameSeries": { path: "/games/{{gameId}}/game-series", query: ["page", "page_size"] },
  "games.movies": { path: "/games/{{gameId}}/movies" },
  "games.parentGames": { path: "/games/{{gameId}}/parent-games", query: ["page", "page_size"] },
  "games.reddit": { path: "/games/{{gameId}}/reddit" },
  "games.screenshots": {
    path: "/games/{{gameId}}/screenshots",
    query: ["ordering", "page", "page_size"],
  },
  "games.stores": { path: "/games/{{gameId}}/stores", query: ["ordering", "page", "page_size"] },
  "genres.get": { path: "/genres/{{id}}" },
  "platforms.parents": {
    path: "/platforms/lists/parents",
    query: ["ordering", "page", "page_size"],
  },
  "platforms.get": { path: "/platforms/{{id}}" },
  "publishers.list": { path: "/publishers", query: ["page", "page_size"] },
  "publishers.get": { path: "/publishers/{{id}}" },
  "stores.list": { path: "/stores", query: ["ordering", "page", "page_size"] },
  "stores.get": { path: "/stores/{{id}}" },
  "tags.list": { path: "/tags", query: ["page", "page_size"] },
  "tags.get": { path: "/tags/{{id}}" },
};

describe("rawg declarative depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declarative action with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...declarativeActionKeys].sort());
  });

  it("declares the L2 missing_http backlog as documented GET JSON operations", () => {
    expect(Object.keys(BACKLOG)).toHaveLength(23);
    for (const [key, documented] of Object.entries(BACKLOG)) {
      const operation = operations[key];
      expect(operation, `${key} is declared`).toBeDefined();
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toBe("read");
      expect(operation.validationMode).toBe("strict-generated");
      expect(operation.responseFormat).toBe("json");
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.request?.method).toBe("GET");
      expect(operation.request?.path).toBe(documented.path);
      expect(operation.request?.success).toEqual([200]);
      expect(operation.request?.body).toBeUndefined();
      expect(Object.keys(operation.request?.query ?? {}).sort()).toEqual([...(documented.query ?? [])].sort());
      expect(operation.inputSchema?.additionalProperties).toBe(false);
      expect(operation.outputSchema?.required).toContain("data");
      for (const placeholder of [...documented.path.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1])) {
        expect(operation.inputSchema?.properties?.[placeholder], `${key} declares ${placeholder}`).toBeDefined();
        expect(operation.inputSchema?.required).toContain(placeholder);
      }
      if (documented.query?.includes("page_size")) {
        expect(operation.inputSchema?.properties?.pageSize?.maximum).toBe(40);
      }
    }
  });
});
