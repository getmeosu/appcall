import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const token = "secret";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; init?: RequestInit };
function capture(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return status === 204 ? new Response(null, { status: 204 }) : json(body, status);
  };
  return { calls, fetchFn };
}

describe("miro deepening", () => {
  test("compiles one handler per action", () => {
    const keys = Object.keys(manifest.operations).sort();
    expect(Object.keys(actions).sort()).toEqual(keys);
    expect(keys).toContain("boards.share");
    expect(keys).toContain("items.create_bulk");
    expect(keys).toContain("mindmapNodes.create");
    expect(keys).toContain("oembed.get");
    expect(keys).toContain("stickyNotes.create");
  });

  test("keeps origin sticky note flattening and adds nested typed creates", async () => {
    const origin = capture({ id: "i2", type: "sticky_note" }, 201);
    await actions["stickyNotes.create"]!({ accessToken: token, boardId: "b1", content: "Ship it", x: 10, y: 20, fetch: origin.fetchFn });
    expect(origin.calls[0]!.url).toBe("https://api.miro.com/v2/boards/b1/sticky_notes");
    expect(JSON.parse(String(origin.calls[0]!.init?.body))).toEqual({ data: { content: "Ship it" }, position: { x: 10, y: 20 } });

    const nested = capture({ id: "i1", type: "shape" }, 201);
    await actions["shapes.create"]!({ accessToken: token, boardId: "board/1", data: { shape: "circle", content: "N" }, fetch: nested.fetchFn });
    expect(nested.calls[0]!.url).toBe("https://api.miro.com/v2/boards/board%2F1/shapes");
    expect(JSON.parse(String(nested.calls[0]!.init?.body))).toEqual({ data: { shape: "circle", content: "N" } });
  });

  test("bulk create posts a JSON array", async () => {
    const { calls, fetchFn } = capture({ data: [{ id: "i1" }] }, 201);
    const items = [{ type: "text", data: { content: "A" } }];
    await actions["items.create_bulk"]!({ accessToken: token, boardId: "b1", items, fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.miro.com/v2/boards/b1/items/bulk");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual(items);
  });

  test("shares a board and deletes a group with query flag", async () => {
    const shared = capture({ data: [] }, 201);
    await actions["boards.share"]!({ accessToken: token, boardId: "b1", emails: ["ada@example.com"], role: "commenter", fetch: shared.fetchFn });
    expect(shared.calls[0]!.url).toBe("https://api.miro.com/v2/boards/b1/members");
    expect(JSON.parse(String(shared.calls[0]!.init?.body))).toEqual({ emails: ["ada@example.com"], role: "commenter" });

    const deleted = capture(null, 204);
    await actions["groups.delete"]!({ accessToken: token, boardId: "b1", groupId: "g1", deleteItems: true, fetch: deleted.fetchFn });
    expect(deleted.calls[0]!.url).toBe("https://api.miro.com/v2/boards/b1/groups/g1?delete_items=true");
    expect(deleted.calls[0]!.init?.method).toBe("DELETE");
  });

  test("uses experimental mind map host and public oembed host", async () => {
    const node = capture({ id: "n1", type: "mindmap_node" }, 201);
    await actions["mindmapNodes.create"]!({ accessToken: token, boardId: "b1", data: { nodeView: { content: "Root" } }, fetch: node.fetchFn });
    expect(node.calls[0]!.url).toBe("https://api.miro.com/v2-experimental/boards/b1/mindmap_nodes");

    const embed = capture({ type: "rich", html: "<iframe></iframe>" });
    await actions["oembed.get"]!({ accessToken: token, url: "https://miro.com/app/board/uXjVJ_fzYUs=", format: "json", fetch: embed.fetchFn });
    expect(embed.calls[0]!.url).toBe("https://miro.com/api/v1/oembed?url=https%3A%2F%2Fmiro.com%2Fapp%2Fboard%2FuXjVJ_fzYUs%3D&format=json");
  });

  test("reads token organization context on v1", async () => {
    const { calls, fetchFn } = capture({ team: { id: "tm1" }, user: { id: "u1" } });
    const result = await actions["organizations.context"]!({ accessToken: token, fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.miro.com/v1/oauth-token");
    expect(result).toMatchObject({ source: "provider", data: { team: { id: "tm1" } } });
  });

  test("attaches tags and downloads image resources", async () => {
    const attached = capture(null, 204);
    await actions["tags.attach"]!({ accessToken: token, boardId: "b1", itemId: "i1", tagId: "t1", fetch: attached.fetchFn });
    expect(attached.calls[0]!.url).toBe("https://api.miro.com/v2/boards/b1/items/i1/tags/t1");
    expect(attached.calls[0]!.init?.method).toBe("POST");

    const downloaded = capture({ url: "https://api.miro.com/signed" });
    await actions["images.download"]!({ accessToken: token, boardId: "b1", resourceId: "r1", format: "original", redirect: false, fetch: downloaded.fetchFn });
    expect(downloaded.calls[0]!.url).toBe("https://api.miro.com/v2/boards/b1/resources/r1?format=original&redirect=false");
  });
});
