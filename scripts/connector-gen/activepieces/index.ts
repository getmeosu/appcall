#!/usr/bin/env bun
// CLI: draft a declarative connector from an Activepieces piece.
//
//   bun run scripts/connector-gen/activepieces/index.ts \
//     --pieces-root ../activepieces/packages/pieces/community \
//     --piece klenty --key klenty --categories crm --models prospect \
//     --out runner/connectors/klenty
//
//   # survey many pieces and report how much is mechanisable
//   bun run scripts/connector-gen/activepieces/index.ts \
//     --pieces-root ../activepieces/packages/pieces/community --survey apollo,asana,klenty
//
// Activepieces community pieces are MIT licensed. A connector derived from one
// MUST keep the MIT notice — the CLI writes it into the generated README.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { prepareWorkspace, actionModules } from "./workspace";
import { draftFromPiece, findPieceDescriptor, type PieceDraft } from "./piece";

type Args = Record<string, string | boolean>;

export function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[token.slice(2)] = true;
      continue;
    }
    args[token.slice(2)] = next;
    index += 1;
  }
  return args;
}

export async function loadPiece(piecesRoot: string, pieceName: string): Promise<Record<string, unknown>> {
  const workspace = mkdtempSync(join(tmpdir(), `ap-${pieceName}-`));
  try {
    const entry = await prepareWorkspace(piecesRoot, pieceName, workspace);

    // Load the action modules first. Starting from an action file resolves the
    // piece's own auth-import cycle in the order that works, and one unloadable
    // action no longer costs the whole piece.
    const actions: Array<Record<string, unknown>> = [];
    const failures: string[] = [];
    for (const modulePath of actionModules(entry)) {
      try {
        for (const value of Object.values(await import(modulePath))) {
          if (looksLikeAction(value)) {
            actions.push(value as Record<string, unknown>);
          }
        }
      } catch (error) {
        failures.push(`${modulePath.split("/lib/actions/")[1]}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let descriptor: Record<string, unknown> | undefined;
    try {
      descriptor = findPieceDescriptor((await import(entry)) as Record<string, unknown>);
    } catch {
      descriptor = undefined;
    }

    if (actions.length === 0 && !descriptor) {
      throw new Error(failures[0] ?? `no actions or piece descriptor found under ${entry}`);
    }
    return {
      displayName: descriptor?.displayName ?? pieceName,
      auth: descriptor?.auth,
      actions: actions.length > 0 ? actions : ((descriptor?.actions ?? []) as unknown),
      __failures: failures,
    };
  } finally {
    // The module graph is already loaded; the workspace has served its purpose.
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function reviewMarkdown(pieceName: string, draft: PieceDraft): string {
  const lines = [
    `# ${draft.manifest.name} — generated draft review`,
    "",
    `Source: Activepieces community piece \`${pieceName}\` (MIT).`,
    `Mechanised ${draft.stats.mechanised} of ${draft.stats.actions} actions.`,
    "",
    "Every operation below still needs a human before it ships: confirm the",
    "endpoint against the provider's own docs, capture real fixtures, and write",
    "the tests described in `runner/connectors/DECLARATIVE.md`.",
    "",
  ];

  if (draft.review.length === 0) {
    lines.push("No actions were flagged.", "");
    return lines.join("\n");
  }

  lines.push("## Actions needing attention", "");
  for (const entry of draft.review) {
    lines.push(`### \`${entry.key}\` — ${entry.title}`, "", `Source action: \`${entry.sourceName}\``, "");
    for (const reason of entry.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function readmeMarkdown(pieceName: string, draft: PieceDraft): string {
  return [
    `# ${draft.manifest.name} connector`,
    "",
    "Declarative connector — see [../DECLARATIVE.md](../DECLARATIVE.md).",
    "",
    "## Attribution",
    "",
    `Derived from the Activepieces community piece \`${pieceName}\`, which is`,
    "distributed under the MIT License. Copyright (c) Activepieces. The MIT",
    "permission and warranty notice applies to the derived operation",
    "definitions in this directory.",
    "",
    "## Status",
    "",
    `Generated draft: ${draft.stats.mechanised} of ${draft.stats.actions} source actions`,
    "were mechanised. See `REVIEW.md`. Not production-ready until every operation",
    "has been verified against the provider's documentation and covered by",
    "fixture tests.",
    "",
  ].join("\n");
}

async function survey(piecesRoot: string, pieceNames: string[]): Promise<void> {
  let totalActions = 0;
  let totalMechanised = 0;
  const failures: string[] = [];

  process.stdout.write(`${"piece".padEnd(24)}${"actions".padStart(8)}${"mech".padStart(6)}${"rate".padStart(7)}  hosts\n`);
  for (const pieceName of pieceNames) {
    try {
      const descriptor = await loadPiece(piecesRoot, pieceName);
      const draft = await draftFromPiece(descriptor, { key: pieceName });
      totalActions += draft.stats.actions;
      totalMechanised += draft.stats.mechanised;
      const rate = draft.stats.actions === 0 ? 0 : Math.round((draft.stats.mechanised / draft.stats.actions) * 100);
      process.stdout.write(
        `${pieceName.padEnd(24)}${String(draft.stats.actions).padStart(8)}${String(draft.stats.mechanised).padStart(6)}${`${rate}%`.padStart(7)}  ${draft.stats.hosts.join(" ")}\n`,
      );
    } catch (error) {
      failures.push(`${pieceName}: ${error instanceof Error ? error.message : String(error)}`);
      process.stdout.write(`${pieceName.padEnd(24)}${"-".padStart(8)}${"-".padStart(6)}${"-".padStart(7)}  load failed\n`);
    }
  }

  const rate = totalActions === 0 ? 0 : Math.round((totalMechanised / totalActions) * 100);
  process.stdout.write(`\ntotal: ${totalMechanised}/${totalActions} actions mechanised (${rate}%)\n`);
  for (const failure of failures) {
    process.stderr.write(`${failure}\n`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const piecesRoot = str(args["pieces-root"]);
  if (!piecesRoot) {
    throw new Error("--pieces-root is required");
  }

  const surveyList = str(args.survey);
  if (surveyList) {
    await survey(piecesRoot, surveyList.split(",").map((name) => name.trim()).filter(Boolean));
    return;
  }

  const pieceName = str(args.piece);
  if (!pieceName) {
    throw new Error("--piece is required");
  }
  const descriptor = await loadPiece(piecesRoot, pieceName);
  const draft = await draftFromPiece(descriptor, {
    key: str(args.key) ?? pieceName,
    name: str(args.name),
    categories: list(args.categories),
    models: list(args.models),
    credentialField: str(args["credential-field"]),
  });

  const out = str(args.out);
  if (!out) {
    process.stdout.write(`${JSON.stringify(draft.manifest, null, 2)}\n`);
    process.stderr.write(`${draft.stats.mechanised}/${draft.stats.actions} actions mechanised\n`);
    return;
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(draft.manifest, null, 2)}\n`);
  writeFileSync(join(out, "REVIEW.md"), reviewMarkdown(pieceName, draft));
  writeFileSync(join(out, "README.md"), readmeMarkdown(pieceName, draft));
  process.stderr.write(
    `wrote ${out}: ${draft.stats.mechanised}/${draft.stats.actions} actions mechanised; ${draft.review.length} need review\n`,
  );
}

function looksLikeAction(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { run?: unknown }).run === "function" &&
    (value as { __customApiCall?: unknown }).__customApiCall !== true
  );
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function list(value: string | boolean | undefined): string[] | undefined {
  const raw = str(value);
  if (!raw) {
    return undefined;
  }
  const items = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
