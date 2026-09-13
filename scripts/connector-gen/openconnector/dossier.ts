import ts from "typescript";
import { createHash } from "node:crypto";
import { relative, join } from "node:path";

export type DossierDiagnostic = { code: string; detail: string; start?: number; end?: number };
export type DossierNode = { kind: string; start: number; end: number; text: string; literals: string[]; rawExpressions: string[] };
export type SourceDossier = {
  providerId: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  actions: Array<{ id: string; source: { path: string; start: number; end: number; line: number }; nodes: DossierNode[]; diagnostics: DossierDiagnostic[] }>;
  diagnostics: DossierDiagnostic[];
  requestSyntax: Array<{ path: string; start: number; end: number; text: string }>;
  status: "EVIDENCE" | "HOLD";
};

const MAX_FILES = 64, MAX_BYTES = 2_000_000, MAX_NODES = 4000, MAX_DEPTH = 8, MAX_TEXT = 1200, MAX_LITERALS = 64;
const hash = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
export function parseSourceDossier(providerId: string, files: Array<{ path: string; content: string }>, limits: Partial<{ maxFiles: number; maxNodes: number; maxDepth: number }> = {}): SourceDossier {
  const maxFiles = limits.maxFiles ?? MAX_FILES, maxNodes = limits.maxNodes ?? MAX_NODES, maxDepth = limits.maxDepth ?? MAX_DEPTH;
  const diagnostics: DossierDiagnostic[] = [], actions: SourceDossier["actions"] = [], requestSyntax: SourceDossier["requestSyntax"] = [];
  if (files.length > maxFiles) diagnostics.push({ code: "FILE_LIMIT", detail: `source closure exceeds ${maxFiles} files` });
  let totalBytes = 0, astNodes = 0;
  for (const file of files.slice(0, maxFiles)) {
    totalBytes += Buffer.byteLength(file.content); if (totalBytes > MAX_BYTES) { diagnostics.push({ code: "BYTE_LIMIT", detail: `source closure exceeds ${MAX_BYTES} bytes` }); break; }
    const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const e of sf.parseDiagnostics) diagnostics.push({ code: "PARSE_ERROR", detail: ts.flattenDiagnosticMessageText(e.messageText, " "), start: e.start, end: e.start === undefined ? undefined : e.start + (e.length ?? 0) });
    const visit = (n: ts.Node, depth: number) => {
      if (astNodes >= maxNodes) { if (!diagnostics.some(x => x.code === "NODE_LIMIT")) diagnostics.push({ code: "NODE_LIMIT", detail: `AST node limit exceeds ${maxNodes}` }); return; } astNodes++;
      if (depth > maxDepth) { diagnostics.push({ code: "DEPTH_LIMIT", detail: `AST depth exceeds ${maxDepth}`, start: n.getStart(sf), end: n.end }); return; }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "defineProviderAction") {
        const name = n.arguments.length > 1 && ts.isObjectLiteralExpression(n.arguments[1]) ? n.arguments[1].properties.find(p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "name") : undefined;
        if (!name || !ts.isPropertyAssignment(name) || !ts.isStringLiteral(name.initializer)) diagnostics.push({ code: "DYNAMIC_NAME", detail: "action name is not a literal", start: n.getStart(sf), end: n.end });
        else { const id = name.initializer.text; const span = { path: file.path, start: n.getStart(sf), end: n.end, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 }; actions.push({ id, source: span, nodes: [], diagnostics: [{ code: "UNBOUND_REQUEST", detail: "binding resolution unavailable; request evidence is file-scoped" }] }); }
      }
      if (ts.isObjectLiteralExpression(n) && ts.isArrayLiteralExpression(n.parent)) { const name = n.properties.find(p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "name"); if (name && ts.isPropertyAssignment(name) && ts.isStringLiteral(name.initializer)) { const handler = n.properties.find(p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && ["handler", "execute", "run"].includes(p.name.text)); actions.push({ id: name.initializer.text, source: { path: file.path, start: n.getStart(sf), end: n.end, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 }, nodes: [], diagnostics: [{ code: handler && ts.isPropertyAssignment(handler) && ts.isIdentifier(handler.initializer) ? "UNRESOLVED_BINDING" : "UNBOUND_REQUEST", detail: "binding resolution unavailable; request evidence is file-scoped" }] }); } }
      if (ts.isCallExpression(n) && ((ts.isIdentifier(n.expression) && ["request", "fetcher"].includes(n.expression.text)) || (ts.isPropertyAccessExpression(n.expression) && ["fetch", "fetcher"].includes(n.expression.name.text)))) requestSyntax.push({ path: file.path, start: n.getStart(sf), end: n.end, text: n.getText(sf).slice(0, MAX_TEXT) });
      if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.name.text === "request") diagnostics.push({ code: "SHADOWED_BINDING", detail: "request binding is lexically shadowed", start: n.getStart(sf), end: n.end });
      ts.forEachChild(n, x => visit(x, depth + 1));
    };
    visit(sf, 0);
  }
  const duplicate = new Set<string>(); for (const a of actions) { if (duplicate.has(a.id)) { a.diagnostics.push({ code: "DUPLICATE_ACTION", detail: `duplicate action id ${a.id}` }); diagnostics.push({ code: "DUPLICATE_ACTION", detail: `duplicate action id ${a.id}` }); } duplicate.add(a.id); }
  return { providerId, files: files.slice(0, maxFiles).map(f => ({ path: f.path, sha256: hash(f.content), bytes: Buffer.byteLength(f.content) })), actions, requestSyntax, diagnostics, status: diagnostics.length || actions.some(a => a.diagnostics.length) ? "HOLD" : "EVIDENCE" };
}

export async function dossierFromProvider(sourceRoot: string, providerId: string, pinned: Record<string, Uint8Array> = {}): Promise<SourceDossier> {
  if (!/^[A-Za-z0-9_-]+$/.test(providerId)) throw new Error("UNSAFE_PROVIDER_ID");
  if (!Object.keys(pinned).length) throw new Error("MISSING_PINNED_BLOBS");
  const prefix = `src/providers/${providerId}/`;
  const files = Object.entries(pinned).filter(([path]) => path.startsWith(prefix) && /\.(ts|tsx)$/.test(path)).sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, content: new TextDecoder().decode(bytes) }));
  if (!files.length) throw new Error("MISSING_PINNED_BLOBS");
  return parseSourceDossier(providerId, files);
}
