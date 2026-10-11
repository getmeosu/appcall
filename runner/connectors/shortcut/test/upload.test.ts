import { describe, expect, test } from "bun:test";
import { uploadFiles } from "../src/actions";

describe("shortcut files.upload", () => {
  test("sends multipart file0 and Shortcut-Token", async () => {
    const seen: Request[] = [];
    const out = await uploadFiles({
      apiKey: "secret",
      story_id: 2,
      files: [
        {
          fileName: "note.txt",
          contentType: "text/plain",
          contentBase64: btoa("hello"),
        },
      ],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify([{ id: 9, name: "note.txt" }]), { status: 201 });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("https://api.app.shortcut.com/api/v3/files");
    expect(seen[0]!.headers.get("shortcut-token")).toBe("secret");
    const form = await seen[0]!.formData();
    expect(form.get("story_id")).toBe("2");
    const file = form.get("file0");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("note.txt");
    expect(out).toMatchObject({
      connector: "shortcut",
      action: "files.upload",
      source: "connector",
      files: [{ id: 9, name: "note.txt" }],
    });
  });

  test("rejects empty files before fetch", async () => {
    await expect(uploadFiles({ apiKey: "secret", files: [] })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});
