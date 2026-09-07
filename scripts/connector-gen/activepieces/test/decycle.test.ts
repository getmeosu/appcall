import { describe, expect, it } from "bun:test";
import { decycleIndex, emptyArrayProperty, stripModuleImports } from "../decycle";

describe("stripModuleImports", () => {
  it("removes a matching single-line import and keeps the others", () => {
    const source = `import { a } from './lib/actions/a';\nimport { b } from './lib/common';\n`;
    const result = stripModuleImports(source, /\/actions\//);
    expect(result).not.toContain("actions/a");
    expect(result).toContain("./lib/common");
  });

  it("removes a multi-line braced import", () => {
    const source = `import {\n  a,\n  b,\n} from './lib/actions/pack';\nconst keep = 1;\n`;
    const result = stripModuleImports(source, /\/actions\//);
    expect(result).not.toContain("./lib/actions/pack");
    expect(result).toContain("const keep = 1;");
  });
});

describe("emptyArrayProperty", () => {
  it("empties the named array", () => {
    expect(emptyArrayProperty("createPiece({ actions: [a, b, c] })", "actions"))
      .toBe("createPiece({ actions: [] })");
  });

  it("scans past nested brackets and braces", () => {
    const source = "createPiece({ actions: [a, { x: [1, 2] }, b], triggers: [t] })";
    expect(emptyArrayProperty(source, "actions"))
      .toBe("createPiece({ actions: [], triggers: [t] })");
  });

  it("ignores brackets inside strings", () => {
    const source = "createPiece({ actions: [a, 'has ] bracket', b] })";
    expect(emptyArrayProperty(source, "actions")).toBe("createPiece({ actions: [] })");
  });

  it("leaves the source alone when the property is absent", () => {
    expect(emptyArrayProperty("createPiece({})", "actions")).toBe("createPiece({})");
  });

  it("does not match a property whose name merely ends with the target", () => {
    expect(emptyArrayProperty("({ customActions: [a], actions: [b] })", "actions"))
      .toBe("({ customActions: [a], actions: [] })");
  });
});

describe("decycleIndex", () => {
  const source = `import { createPiece, PieceAuth } from '@activepieces/pieces-framework';
import { createCard } from './lib/actions/create-card';
import { cardUpdated } from './lib/triggers/card-updated';

const markdownProperty = \`Find your key at Trello\`;

export const trelloAuth = PieceAuth.BasicAuth({
  description: markdownProperty,
  username: { displayName: 'Key' },
});

export const trello = createPiece({
  displayName: 'Trello',
  auth: trelloAuth,
  actions: [createCard],
  triggers: [cardUpdated],
});
`;

  it("removes the action and trigger imports that close the cycle", () => {
    const result = decycleIndex(source);
    expect(result).not.toContain("./lib/actions/create-card");
    expect(result).not.toContain("./lib/triggers/card-updated");
    expect(result).toContain("@activepieces/pieces-framework");
  });

  it("empties the arrays that referenced them", () => {
    const result = decycleIndex(source);
    expect(result).toContain("actions: []");
    expect(result).toContain("triggers: []");
  });

  it("keeps every other declaration, exported or not, in place", () => {
    const result = decycleIndex(source);
    expect(result).toContain("const markdownProperty =");
    expect(result).toContain("export const trelloAuth = PieceAuth.BasicAuth({");
    expect(result).toContain("description: markdownProperty,");
    expect(result).toContain("displayName: 'Trello'");
  });

  it("is a no-op for an index with no action imports", () => {
    const plain = `export const piece = createPiece({ displayName: 'X', actions: [] });\n`;
    expect(decycleIndex(plain)).toBe(plain);
  });
});
