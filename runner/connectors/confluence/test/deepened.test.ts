import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import routes from "./deepened-routes.json";
import propertyFixture from "../fixtures/property.json";
import propertiesFixture from "../fixtures/properties.json";
import whiteboardFixture from "../fixtures/whiteboard.json";
import likesFixture from "../fixtures/likes.json";
import operationsFixture from "../fixtures/operations.json";
import versionsFixture from "../fixtures/versions.json";
import versionFixture from "../fixtures/version.json";
import ancestorsFixture from "../fixtures/ancestors.json";
import auditFixture from "../fixtures/audit.json";
import restrictionsFixture from "../fixtures/restrictions.json";
import tasksFixture from "../fixtures/tasks.json";
import taskFixture from "../fixtures/task.json";
import anonymousFixture from "../fixtures/anonymous_user.json";
import spaceContentsFixture from "../fixtures/space_contents.json";
import inlineCommentsFixture from "../fixtures/inline_comments.json";
import longtaskFixture from "../fixtures/longtask.json";
import usersSearchFixture from "../fixtures/users_search.json";
import labelsFixture from "../fixtures/labels.json";
import blogpostsFixture from "../fixtures/blogposts.json";
import pagesFixture from "../fixtures/pages.json";
import spacesFixture from "../fixtures/spaces.json";
import searchFixture from "../fixtures/search.json";
import pageFixture from "../fixtures/page.json";
import commentFixture from "../fixtures/comment.json";
import spaceFixture from "../fixtures/space.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const creds = { site: "acme.atlassian.net", email: "me@acme.com", apiToken: "tok123", basicAuth: "bWU6dG9rMTIz" };

type Call = { url: string; init?: RequestInit };

function mockBody(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    if (status === 204) {
      return new Response(null, { status });
    }
    if (typeof body === "string") {
      return new Response(body, { status, headers: { "Content-Type": "application/octet-stream" } });
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

function renderedPath(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_match, name: string) =>
    encodeURIComponent(String(input[name])),
  );
}

function fixtureFor(key: string, method: string): unknown {
  if (method === "DELETE" && key !== "space.delete") return null;
  switch (key) {
    case "blogpost.property.create":
    case "whiteboard.property.create":
    case "page.property.create":
    case "space.property.create":
    case "blogpost.property.update":
    case "page.property.update":
    case "whiteboard.property.update":
    case "space.property.update":
      return propertyFixture;
    case "blogpost.properties.list":
    case "page.properties.list":
    case "space.properties.list":
      return propertiesFixture;
    case "whiteboard.create":
      return whiteboardFixture;
    case "comment.inline.create":
      return commentFixture;
    case "space.createPrivate":
      return spaceFixture;
    case "space.delete":
      return longtaskFixture;
    case "blogpost.likes.count":
    case "page.likes.count":
      return likesFixture;
    case "blogpost.operations.list":
      return operationsFixture;
    case "blogpost.version.get":
      return versionFixture;
    case "blogpost.versions.list":
    case "page.versions.list":
      return versionsFixture;
    case "page.ancestors.list":
      return ancestorsFixture;
    case "audit.list":
      return auditFixture;
    case "content.restrictions.get":
      return restrictionsFixture;
    case "tasks.list":
      return tasksFixture;
    case "task.update":
      return taskFixture;
    case "user.anonymous.get":
      return anonymousFixture;
    case "space.contents.list":
      return spaceContentsFixture;
    case "blogpost.inlineComments.list":
    case "page.inlineComments.list":
      return inlineCommentsFixture;
    case "search.users":
      return usersSearchFixture;
    case "attachment.labels.list":
    case "blogpost.labels.list":
    case "labels.listAll":
    case "space.labels.list":
    case "space.contentLabels.list":
      return labelsFixture;
    case "label.blogposts.list":
      return blogpostsFixture;
    case "search.pages":
      return pagesFixture;
    case "search.spaces":
      return spacesFixture;
    case "search.content":
      return searchFixture;
    case "page.findText":
    case "blogpost.update":
      return pageFixture;
    case "attachment.download":
      return "PNG-BYTES";
    default:
      return pageFixture;
  }
}

describe("confluence composio deepening", () => {
  it("compiles every declared action", () => {
    const actionKeys = Object.entries(manifest.operations as Record<string, { kind: string }>)
      .filter(([, op]) => op.kind === "action")
      .map(([key]) => key)
      .sort();
    expect(Object.keys(actions).sort()).toEqual(actionKeys);
  });

  it("covers 48 new Composio tools as real HTTP routes", () => {
    expect(routes).toHaveLength(48);
  });

  it.each(routes)("$key hits $method $path", async (route) => {
    const method = route.method as string;
    const success = (route.success as number[])[0] ?? 200;
    const body = fixtureFor(route.key, method);
    const { calls, fetchFn } = mockBody(body, method === "DELETE" && route.key !== "space.delete" ? 204 : success);
    const result = await actions[route.key]!({
      ...creds,
      ...(route.input as Record<string, unknown>),
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.method ?? "GET").toBe(method);
    const url = new URL(calls[0]!.url);
    expect(url.hostname).toBe("acme.atlassian.net");
    expect(url.pathname).toBe(`/wiki${renderedPath(route.path, route.input as Record<string, unknown>)}`);
    expect(result.connector).toBe("confluence");
    expect(result.action).toBe(route.key);
    expect(result.source).toBe("provider");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Basic bWU6dG9rMTIz" });
  });

  it("search.content interpolates the title CQL from query", async () => {
    const { calls, fetchFn } = mockBody(searchFixture);
    await actions["search.content"]!({ ...creds, query: "onboarding", fetch: fetchFn });
    expect(new URL(calls[0]!.url).searchParams.get("cql")).toBe('title ~ "onboarding"');
  });

  it("search.pages filters by space_id and title", async () => {
    const { calls, fetchFn } = mockBody(pagesFixture);
    await actions["search.pages"]!({ ...creds, space_id: "98765", title: "My Confluence Page", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/wiki/api/v2/pages");
    expect(url.searchParams.get("space-id")).toBe("98765");
    expect(url.searchParams.get("title")).toBe("My Confluence Page");
  });

  it("page.property.create posts key and value", async () => {
    const { calls, fetchFn } = mockBody(propertyFixture);
    await actions["page.property.create"]!({
      ...creds, page_id: "123456", key: "owner", value: "eng", fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ key: "owner", value: "eng" });
  });

  it("task.update puts status", async () => {
    const { calls, fetchFn } = mockBody(taskFixture);
    await actions["task.update"]!({ ...creds, id: "t1001", status: "complete", fetch: fetchFn });
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/api/v2/tasks/t1001");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ id: "t1001", status: "complete" });
  });

  it("space.delete calls v1 by space key", async () => {
    const { calls, fetchFn } = mockBody(longtaskFixture, 202);
    const result = await actions["space.delete"]!({ ...creds, space_key: "OLD", fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(new URL(calls[0]!.url).pathname).toBe("/wiki/rest/api/space/OLD");
    expect((result.task as Record<string, unknown>).id).toBe("task-space-delete-1");
  });
});
