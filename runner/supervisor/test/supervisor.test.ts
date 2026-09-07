import { expect, test } from "bun:test";
import { superviseRunner } from "../src/supervisor";

test("terminates and replaces a non-cooperative CPU child within a bounded lifetime", async () => {
  const events: Array<{ event: string; pid?: number }> = [];
  const supervisor = superviseRunner({
    command: [process.execPath, "--eval", 'process.on("SIGTERM", () => {}); while (true) {}'],
    maxLifetimeMs: 100,
    terminationGraceMs: 20,
    restartDelayMs: 5,
    maxRestarts: 1,
    onEvent: event => events.push(event),
    stdout: "ignore",
    stderr: "ignore",
  });
  await supervisor.done;
  expect(events.filter(e => e.event === "started")).toHaveLength(2);
  expect(events.filter(e => e.event === "force_killed")).toHaveLength(2);
  const pids = events.filter(e => e.event === "started").map(e => e.pid);
  expect(new Set(pids).size).toBe(2);
  for (const pid of pids) expect(() => process.kill(pid!, 0)).toThrow();
}, 5000);

test("explicit stop terminates a child and suppresses restarts", async () => {
  const events: Array<{ event: string }> = [];
  const supervisor = superviseRunner({
    command: [process.execPath, "--eval", "setInterval(() => {}, 1000)"],
    maxLifetimeMs: 5000,
    terminationGraceMs: 20,
    restartDelayMs: 1,
    onEvent: event => events.push(event),
    stdout: "ignore",
    stderr: "ignore",
  });
  await supervisor.stop();
  expect(events.filter(e => e.event === "started")).toHaveLength(1);
});

test("allows a cooperative child to finish draining before termination", async () => {
  const events: Array<{ event: string; exitCode?: number }> = [];
  const supervisor = superviseRunner({
    command: [process.execPath, "--eval", 'process.on("SIGTERM", () => setTimeout(() => process.exit(0), 20)); setInterval(() => {}, 1000)'],
    maxLifetimeMs: 100,
    terminationGraceMs: 100,
    restartDelayMs: 1,
    maxRestarts: 0,
    onEvent: event => events.push(event),
    stdout: "ignore",
    stderr: "ignore",
  });
  await supervisor.done;
  expect(events.some(event => event.event === "terminating")).toBe(true);
  expect(events.some(event => event.event === "force_killed")).toBe(false);
  expect(events.find(event => event.event === "exited")?.exitCode).toBe(0);
});
