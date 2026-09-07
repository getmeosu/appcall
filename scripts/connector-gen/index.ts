#!/usr/bin/env bun
// CLI: generate a declarative connector manifest from an OpenAPI document.
//
//   bun run scripts/connector-gen/index.ts \
//     --spec https://example.com/openapi.json \
//     --key acme --name Acme \
//     --auth-type api_key --auth-field apiKey \
//     --tags Contacts,Deals \
//     --categories crm --models contact,deal \
//     --out runner/connectors/acme/manifest.json
//
// The output is a draft to review, trim, and commit — not something to generate
// at runtime. Read every operation it emits before merging: an unreviewed
// 300-tool connector is worse for an agent than a curated 12-tool one.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateManifest, type AuthOption, type GenerateOptions } from "./openapi";

type Args = Record<string, string | boolean>;

export function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[name] = true;
      continue;
    }
    args[name] = next;
    index += 1;
  }
  return args;
}

export function optionsFromArgs(args: Args): GenerateOptions {
  const key = requireArg(args, "key");
  const auth: AuthOption = {
    type: (str(args["auth-type"]) ?? "api_key") as AuthOption["type"],
    field: str(args["auth-field"]) ?? "apiKey",
    in: (str(args["auth-in"]) ?? "header") as "header" | "query",
    name: str(args["auth-header"]) ?? "Authorization",
    value: str(args["auth-value"]),
    label: str(args["auth-label"]),
    scopes: list(args.scopes),
  };
  if (!auth.value) {
    delete auth.value;
  }

  return {
    key,
    name: str(args.name) ?? key,
    version: str(args.version),
    categories: list(args.categories),
    models: list(args.models),
    auth,
    includeTags: list(args.tags),
    includePaths: list(args.paths),
    timeoutMs: num(args["timeout-ms"]),
    maxInputBytes: num(args["max-input-bytes"]),
    maxResponseBytes: num(args["max-response-bytes"]),
  };
}

export async function loadSpec(source: string): Promise<Record<string, unknown>> {
  const raw = source.startsWith("http")
    ? await (await fetch(source)).text()
    : readFileSync(source, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const spec = await loadSpec(requireArg(args, "spec"));
  const manifest = generateManifest(spec, optionsFromArgs(args));
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  const out = str(args.out);
  if (!out) {
    process.stdout.write(serialized);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serialized);
  const count = Object.keys(manifest.operations as Record<string, unknown>).length;
  process.stderr.write(`wrote ${out} with ${count} operations — review every one before committing\n`);
}

function requireArg(args: Args, name: string): string {
  const value = str(args[name]);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: string | boolean | undefined): number | undefined {
  const parsed = Number(str(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
