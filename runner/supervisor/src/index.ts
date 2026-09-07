import { fileURLToPath } from "node:url";
import { superviseRunner } from "./supervisor";

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

const supervisor = superviseRunner({
  command: [process.execPath, "run", fileURLToPath(new URL("../../bun/src/index.ts", import.meta.url))],
  maxLifetimeMs: positiveInteger("APPCALL_RUNNER_MAX_LIFETIME_MS", 300_000),
  terminationGraceMs: positiveInteger("APPCALL_RUNNER_TERMINATION_GRACE_MS", 65_000),
  restartDelayMs: positiveInteger("APPCALL_RUNNER_RESTART_DELAY_MS", 1_000),
  onEvent: event => console.info(JSON.stringify({ component: "runner_supervisor", ...event })),
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => { void supervisor.stop(); });
}
await supervisor.done;
