import { defaultConnectorRegistry } from "./registry";
import { createFetchHandler } from "./serve";
import { validateRegistryForStartup } from "./startup";

const port = Number(Bun.env.APPCALL_RUNNER_PORT ?? "5081");
// Default to loopback so the runner (which executes actions with real
// credentials and has no auth of its own beyond the token) is never exposed
// off-host by accident. Containers set APPCALL_RUNNER_HOST=0.0.0.0.
const hostname = Bun.env.APPCALL_RUNNER_HOST?.trim() || "127.0.0.1";
const token = Bun.env.APPCALL_RUNNER_TOKEN?.trim() || undefined;

validateRegistryForStartup(defaultConnectorRegistry);

const server = Bun.serve({
  hostname,
  port,
  fetch: createFetchHandler({
    token,
    maxConcurrent: runnerInteger("APPCALL_RUNNER_MAX_CONCURRENT", 32),
    maxQueued: runnerInteger("APPCALL_RUNNER_MAX_QUEUED", 128, 0),
    maxJobs: runnerInteger("APPCALL_RUNNER_MAX_JOBS", 10_000),
    onRecycle: () => { void stop(); },
  }),
});

console.info(
  JSON.stringify({
    component: "runner",
    event: "started",
    hostname,
    port: server.port,
    tokenRequired: Boolean(token),
  }),
);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop(false);
  process.exit(0);
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => { void stop(); });
}

function runnerInteger(name: string, fallback: number, minimum = 1): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} is invalid`);
  return value;
}
