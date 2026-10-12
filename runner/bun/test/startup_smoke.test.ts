import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

// Resolve the entrypoint relative to this test file so the smoke test spawns the
// real index.ts regardless of the cwd bun is invoked from (repo root or
// runner/bun). A cwd-relative path silently resolved to a missing module and the
// spawned runner died before binding the port (ConnectionRefused).
const runnerEntrypoint = resolve(import.meta.dir, "../src/index.ts");

describe("runner startup smoke", () => {
  test("real runner entrypoint serves RPC after startup validation", async () => {
    const smokePort = await reserveFreePort();
    const smokeURL = `http://127.0.0.1:${smokePort}/rpc`;
    const process = spawnRunner({ APPCALL_RUNNER_PORT: String(smokePort) });

    try {
      const response = await waitForRunnerRPC(smokeURL);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.runner).toBe("appcall-bun");
    } finally {
      await stopRunner(process);
    }
  }, 20000);

  test("APPCALL_RUNNER_TOKEN gates RPC end-to-end through the real entrypoint", async () => {
    const smokePort = await reserveFreePort();
    const smokeURL = `http://127.0.0.1:${smokePort}/rpc`;
    const process = spawnRunner({ APPCALL_RUNNER_PORT: String(smokePort), APPCALL_RUNNER_TOKEN: "tok-smoke-1" });

    try {
      // Wait for the port via the always-open healthz, then prove the gate.
      await waitForRunnerHealthz(`http://127.0.0.1:${smokePort}/healthz`);

      const unauthenticated = await fetch(smokeURL, {
        method: "POST",
        body: JSON.stringify({ id: "req_smoke", method: "runner.describe" }),
      });
      expect(unauthenticated.status).toBe(401);

      const authenticated = await fetch(smokeURL, {
        method: "POST",
        headers: { authorization: "Bearer tok-smoke-1" },
        body: JSON.stringify({ id: "req_smoke", method: "runner.describe" }),
      });
      const body = await authenticated.json();
      expect(authenticated.status).toBe(200);
      expect(body.result.runner).toBe("appcall-bun");
    } finally {
      await stopRunner(process);
    }
  }, 20000);
});

// `bun` on PATH can be a wrapper that forks the real binary, so killing the direct child left the
// runner running (2 leaked runners per file run). The runner leads its own process group
// (detached) and the whole group is killed; then no process may remain in it.
function spawnRunner(env: Record<string, string>) {
  return Bun.spawn(["bun", "run", runnerEntrypoint], {
    env: { ...Bun.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
}

function groupMembers(pgid: number): number[] {
  const ps = Bun.spawnSync(["ps", "-eo", "pid=,pgid="]);
  return ps.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([pid, group]) => group === pgid && Number.isInteger(pid))
    .map(([pid]) => pid!);
}

async function stopRunner(runner: ReturnType<typeof spawnRunner>): Promise<void> {
  const pgid = runner.pid;
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    // The group may already be gone.
  }
  await runner.exited;
  for (let attempt = 0; attempt < 50 && groupMembers(pgid).length > 0; attempt += 1) await Bun.sleep(20);
  expect(groupMembers(pgid), "runner child processes left").toEqual([]);
}

async function waitForRunnerHealthz(healthzURL: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(healthzURL);
      if (response.ok) {
        return;
      }
      lastError = new Error(`runner healthz returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(100);
  }
  throw lastError instanceof Error ? lastError : new Error("runner did not start");
}

async function reserveFreePort(): Promise<number> {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
    },
  });
  const port = server.port;
  server.stop(true);
  return port;
}

async function waitForRunnerRPC(smokeURL: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(smokeURL, {
        method: "POST",
        body: JSON.stringify({ id: "req_smoke", method: "runner.describe" }),
      });
      if (response.ok) {
        return response;
      }
      lastError = new Error(`runner returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(100);
  }
  throw lastError instanceof Error ? lastError : new Error("runner did not start");
}
