import ts from "typescript";

// Revision guard (codeant flag, linus). Only src/revision.ts may contain a YYYY-MM-DD date.
// Every other src file is parsed with the TypeScript compiler, and every string-valued token is
// checked: string literals, no-substitution templates, template head/middle/tail chunks, regex
// literals, and string concatenations of literals folded to one value. So the guard does not depend
// on how the value is used (headers.set('revision', ...), { revision: ... }, header maps, Headers
// tuples, templates, consts, literal types). Comments are trivia, so they are not scanned.
// Limit: a date computed at runtime from non-literal parts (e.g. `2026-${m}-15`, Date formatting)
// cannot be proven statically and is not caught.

export const DATE = /\d{4}-\d{2}-\d{2}/;

export type Hit = { file: string; line: number; text: string; allowedBy?: string };

/**
 * Explicit allowlist. Each entry must prove that the literal is not a revision: exact value AND
 * exact syntactic position.
 */
export const ALLOWLIST: { id: string; value: string; reason: string; matches: (node: ts.Node) => boolean }[] = [
  {
    id: "modelVersion",
    value: "2026-05-16",
    reason:
      "Normalized-model schema version: the value (or literal type) of a property named modelVersion in an " +
      "object literal or type. It is emitted in normalized outputs and never sent to Klaviyo.",
    matches: (node) => {
      let target: ts.Node = node;
      if (ts.isLiteralTypeNode(target.parent)) target = target.parent; // modelVersion: "2026-05-16" in a type
      const parent = target.parent;
      return (
        (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) &&
        (parent.initializer === target || (ts.isPropertySignature(parent) && parent.type === target)) &&
        (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) &&
        parent.name.text === "modelVersion"
      );
    },
  },
];

function folded(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return folded(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = folded(node.left);
    const r = folded(node.right);
    return l !== null && r !== null ? l + r : null;
  }
  return null;
}

export function scanSource(file: string, text: string): Hit[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: Hit[] = [];
  const add = (node: ts.Node, value: string) => {
    if (!DATE.test(value)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const allow = ALLOWLIST.find((a) => a.value === value && a.matches(node));
    hits.push({ file, line, text: value, ...(allow ? { allowedBy: allow.id } : {}) });
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      // Literal chunks joined without the substitutions, so `2026-07${sep}-15` is caught too.
      add(node, node.head.text + node.templateSpans.map((s) => s.literal.text).join(""));
    } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) add(node, node.getText(sf));
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const value = folded(node);
      if (value !== null && !(ts.isBinaryExpression(node.parent) && folded(node.parent) !== null)) {
        // Report only the outermost folded concat, and only when no single piece already holds a date.
        const piecesHaveDate = (n: ts.Node): boolean =>
          ts.isBinaryExpression(n) ? piecesHaveDate(n.left) || piecesHaveDate(n.right) : ts.isParenthesizedExpression(n) ? piecesHaveDate(n.expression) : DATE.test(folded(n) ?? "");
        if (!piecesHaveDate(node)) add(node, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}
