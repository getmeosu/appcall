export type SupervisorEvent = { event: string; pid?: number; exitCode?: number };
export type SupervisorOptions = {
  command: string[];
  maxLifetimeMs: number;
  terminationGraceMs: number;
  restartDelayMs: number;
  maxRestarts?: number;
  stdout?: "inherit" | "ignore";
  stderr?: "inherit" | "ignore";
  onEvent?: (event: SupervisorEvent) => void;
};

// The watchdog lives in a separate process: a handler blocking the child's
// event loop cannot prevent its termination. Only one child exists at a time.
export function superviseRunner(options: SupervisorOptions): {
  done: Promise<void>;
  stop: () => Promise<void>;
} {
  for (const value of [options.maxLifetimeMs, options.terminationGraceMs, options.restartDelayMs]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid supervisor time limit");
  }
  if (!options.command.length) throw new Error("Runner command is required");
  if (options.maxRestarts !== undefined && (!Number.isSafeInteger(options.maxRestarts) || options.maxRestarts < 0)) {
    throw new Error("Invalid restart limit");
  }

  let stopping = false;
  let terminate: (() => void) | undefined;
  let wakeDelay: (() => void) | undefined;
  const emit = (event: SupervisorEvent) => options.onEvent?.(event);
  const done = (async () => {
    for (let restart = 0; !stopping; restart++) {
      const child = Bun.spawn(options.command, {
        stdin: "ignore",
        stdout: options.stdout ?? "inherit",
        stderr: options.stderr ?? "inherit",
      });
      emit({ event: "started", pid: child.pid });
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      terminate = () => {
        if (killTimer !== undefined || child.exitCode !== null) return;
        emit({ event: "terminating", pid: child.pid });
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (child.exitCode !== null) return;
          emit({ event: "force_killed", pid: child.pid });
          child.kill("SIGKILL");
        }, options.terminationGraceMs);
      };
      const lifetimeTimer = setTimeout(() => terminate?.(), options.maxLifetimeMs);
      const exitCode = await child.exited;
      clearTimeout(lifetimeTimer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      terminate = undefined;
      emit({ event: "exited", pid: child.pid, exitCode });
      if (stopping || restart >= (options.maxRestarts ?? Infinity)) break;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, options.restartDelayMs);
        wakeDelay = () => { clearTimeout(timer); resolve(); };
      });
      wakeDelay = undefined;
    }
  })();
  return {
    done,
    async stop() {
      stopping = true;
      terminate?.();
      wakeDelay?.();
      await done;
    },
  };
}
