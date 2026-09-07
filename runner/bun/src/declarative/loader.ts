// Discovery and wiring for declarative connectors.
//
// A declarative connector carries no TypeScript, so it needs no import and no
// entry in registry.ts — the file that has been the real cost of every new
// connector. The loader walks the connectors root, keeps the manifests that
// declare at least one `request` block, and hands the registry compiled
// handlers alongside the statically imported ones.
//
// Precedence is deliberate: a registered hand-written handler always wins over
// a compiled one, so a connector can migrate operation by operation and an
// irregular provider call can always be taken over by real code.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector, isDeclarativeManifest } from "./compile";
import type { CompiledHandler, DeclarativeManifest } from "./types";
import { isRecord } from "./template";

export const connectorsRoot = new URL("../../../connectors", import.meta.url).pathname;

export function loadDeclarativeManifests(root: string = connectorsRoot): DeclarativeManifest[] {
  if (!existsSync(root)) {
    return [];
  }

  const manifests: DeclarativeManifest[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = join(root, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = readManifest(manifestPath, entry.name);
    if (isDeclarativeManifest(manifest)) {
      manifests.push(manifest as DeclarativeManifest);
    }
  }

  return manifests.sort((left, right) => left.key.localeCompare(right.key));
}

type RegistryInput = {
  manifests: unknown[];
  healthchecks: Record<string, (input?: unknown) => unknown>;
  actions: Record<string, Record<string, CompiledHandler>>;
  syncs?: Record<string, Record<string, CompiledHandler>>;
  webhooks?: unknown;
};

export function withDeclarativeConnectors<T extends RegistryInput>(input: T, root: string = connectorsRoot): T {
  const registeredKeys = new Set(
    input.manifests.filter(isRecord).map((manifest) => String(manifest.key)),
  );

  const discovered = loadDeclarativeManifests(root).filter((manifest) => !registeredKeys.has(manifest.key));
  const manifests = [...input.manifests, ...discovered];

  const actions: Record<string, Record<string, CompiledHandler>> = { ...input.actions };
  const syncs: Record<string, Record<string, CompiledHandler>> = { ...(input.syncs ?? {}) };
  const healthchecks: Record<string, (input?: unknown) => unknown> = { ...input.healthchecks };

  for (const manifest of manifests) {
    if (!isRecord(manifest) || !isDeclarativeManifest(manifest)) {
      continue;
    }
    const compiled = compileDeclarativeConnector(manifest as DeclarativeManifest);
    // Spread compiled first so a registered hand-written handler overrides it.
    actions[compiled.key] = { ...compiled.actions, ...(input.actions[compiled.key] ?? {}) };
    if (Object.keys(compiled.syncs).length > 0) {
      syncs[compiled.key] = { ...compiled.syncs, ...(input.syncs?.[compiled.key] ?? {}) };
    }
    // A declarative `healthcheck` operation doubles as the connector's
    // healthcheck handler, so connection Test makes the same real authenticated
    // call the manifest declares rather than reporting an unverified pass.
    const compiledHealthcheck = compiled.actions.healthcheck;
    if (compiledHealthcheck && !healthchecks[compiled.key]) {
      healthchecks[compiled.key] = (healthcheckInput?: unknown) => compiledHealthcheck(healthcheckInput ?? {});
    }
  }

  return { ...input, manifests, actions, syncs, healthchecks };
}

function readManifest(path: string, directory: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid connector manifest ${directory}/manifest.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
