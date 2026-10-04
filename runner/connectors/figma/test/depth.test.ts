import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import reactionsFixture from "../fixtures/reactions.json";
import reactionFixture from "../fixtures/reaction.json";
import fileComponentsFixture from "../fixtures/file_components.json";
import fileComponentSetsFixture from "../fixtures/file_component_sets.json";
import fileStylesFixture from "../fixtures/file_styles.json";
import componentFixture from "../fixtures/component.json";
import componentSetFixture from "../fixtures/component_set.json";
import styleFixture from "../fixtures/style.json";
import teamComponentsFixture from "../fixtures/team_components.json";
import teamStylesFixture from "../fixtures/team_styles.json";
import variablesLocalFixture from "../fixtures/variables_local.json";
import devResourcesFixture from "../fixtures/dev_resources.json";
import devResourceCreatedFixture from "../fixtures/dev_resource_created.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mock(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

function sentBody(call: Call): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("figma depth slice", () => {
  it("bumps the connector to a minor version for the new surface", () => {
    expect(manifest.version).toBe("0.2.0");
  });

  it("comment.listReactions reads reactions through the meta envelope", async () => {
    expect(() => actions["comment.listReactions"]!({ accessToken: "tok", fileKey: "abcXYZ123" })).toThrow("commentId is required");
    const { calls, fetchFn } = mock(reactionsFixture);
    const result = (await actions["comment.listReactions"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      commentId: "1234567890123456",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/comments/1234567890123456/reactions");
    expect(result.reactions).toEqual(reactionsFixture.meta.reactions);
  });

  it("comment.createReaction posts the emoji", async () => {
    const { calls, fetchFn } = mock(reactionFixture);
    const result = (await actions["comment.createReaction"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      commentId: "1234567890123456",
      emoji: ":heart:",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sentBody(calls[0]!)).toEqual({ emoji: ":heart:" });
    expect(result.reactions).toEqual(reactionFixture.meta.reactions);
  });

  it("comment.deleteReaction deletes a specific emoji", async () => {
    const { calls, fetchFn } = mock(null, 200);
    const result = (await actions["comment.deleteReaction"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      commentId: "1234567890123456",
      emoji: ":heart:",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/files/abcXYZ123/comments/1234567890123456/reactions");
    expect(url.searchParams.get("emoji")).toBe(":heart:");
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(result).toMatchObject({ deleted: true, commentId: "1234567890123456", emoji: ":heart:" });
  });

  it("file.listComponents reads published components from a library file", async () => {
    const { calls, fetchFn } = mock(fileComponentsFixture);
    const result = (await actions["file.listComponents"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/components");
    expect(result.components).toEqual(fileComponentsFixture.meta.components);
  });

  it("file.listComponentSets and file.listStyles read published library metadata", async () => {
    const { calls: setCalls, fetchFn: setFetch } = mock(fileComponentSetsFixture);
    const sets = (await actions["file.listComponentSets"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      fetch: setFetch,
    })) as Record<string, unknown>;
    expect(setCalls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/component_sets");
    expect(sets.componentSets).toEqual(fileComponentSetsFixture.meta.component_sets);

    const { calls: styleCalls, fetchFn: styleFetch } = mock(fileStylesFixture);
    const styles = (await actions["file.listStyles"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      fetch: styleFetch,
    })) as Record<string, unknown>;
    expect(styleCalls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/styles");
    expect(styles.styles).toEqual(fileStylesFixture.meta.styles);
  });

  it("component.get / componentSet.get / style.get require the published key", async () => {
    expect(() => actions["component.get"]!({ accessToken: "tok" })).toThrow("componentKey is required");
    expect(() => actions["componentSet.get"]!({ accessToken: "tok" })).toThrow("componentSetKey is required");
    expect(() => actions["style.get"]!({ accessToken: "tok" })).toThrow("styleKey is required");

    const { calls, fetchFn } = mock(componentFixture);
    const component = (await actions["component.get"]!({
      accessToken: "tok",
      componentKey: "compKey123",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/components/compKey123");
    expect(component.component).toEqual(componentFixture.meta);

    const { fetchFn: setFetch } = mock(componentSetFixture);
    const set = (await actions["componentSet.get"]!({
      accessToken: "tok",
      componentSetKey: "setKey123",
      fetch: setFetch,
    })) as Record<string, unknown>;
    expect(set.componentSet).toEqual(componentSetFixture.meta);

    const { fetchFn: styleFetch } = mock(styleFixture);
    const style = (await actions["style.get"]!({
      accessToken: "tok",
      styleKey: "styleKey123",
      fetch: styleFetch,
    })) as Record<string, unknown>;
    expect(style.style).toEqual(styleFixture.meta);
  });

  it("team.listComponents paginates with page_size/after/before", async () => {
    const { calls, fetchFn } = mock(teamComponentsFixture);
    const result = (await actions["team.listComponents"]!({
      accessToken: "tok",
      teamId: "999999",
      pageSize: 30,
      after: 2,
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/teams/999999/components");
    expect(url.searchParams.get("page_size")).toBe("30");
    expect(url.searchParams.get("after")).toBe("2");
    expect(result.components).toEqual(teamComponentsFixture.meta.components);
    expect(result.after).toBe(2);
  });

  it("team.listStyles lists published team styles", async () => {
    const { calls, fetchFn } = mock(teamStylesFixture);
    const result = (await actions["team.listStyles"]!({
      accessToken: "tok",
      teamId: "999999",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/teams/999999/styles");
    expect(result.styles).toEqual(teamStylesFixture.meta.styles);
  });

  it("variables.listLocal returns collections and variables", async () => {
    const { calls, fetchFn } = mock(variablesLocalFixture);
    const result = (await actions["variables.listLocal"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/variables/local");
    expect(result.variables).toEqual(variablesLocalFixture.meta.variables);
    expect(result.variableCollections).toEqual(variablesLocalFixture.meta.variableCollections);
  });

  it("devResources.list and create attach uniquely-URLed resources to nodes", async () => {
    const { calls, fetchFn } = mock(devResourcesFixture);
    const listed = (await actions["devResources.list"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      nodeIds: "1:2",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const listUrl = new URL(calls[0]!.url);
    expect(listUrl.pathname).toBe("/v1/files/abcXYZ123/dev_resources");
    expect(listUrl.searchParams.get("node_ids")).toBe("1:2");
    expect(listed.devResources).toEqual(devResourcesFixture.dev_resources);

    const { calls: createCalls, fetchFn: createFetch } = mock(devResourceCreatedFixture);
    const created = (await actions["devResources.create"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      nodeId: "1:2",
      name: "Storybook",
      url: "https://storybook.example.com/button",
      fetch: createFetch,
    })) as Record<string, unknown>;
    expect(createCalls[0]!.url).toBe("https://api.figma.com/v1/dev_resources");
    expect(createCalls[0]!.init?.method).toBe("POST");
    expect(sentBody(createCalls[0]!)).toEqual({
      dev_resources: [
        {
          file_key: "abcXYZ123",
          node_id: "1:2",
          name: "Storybook",
          url: "https://storybook.example.com/button",
        },
      ],
    });
    expect(created.linksCreated).toEqual(devResourceCreatedFixture.links_created);
  });
});
