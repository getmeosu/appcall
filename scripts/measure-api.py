#!/usr/bin/env python3
"""Native macOS API process benchmark; isolated PostgreSQL, synthetic runner only.

Build binaries separately. Never includes build, migration, database or runner
resource consumption in the API process measurements. No live provider calls.
"""
import argparse
import concurrent.futures
import ctypes
import datetime
import hashlib
import http.client
import http.server
import json
import math
import os
import pathlib
import platform
import resource
import shutil
import socket
import statistics
import subprocess
import tempfile
import threading
import time
import urllib.parse
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = "synthetic-benchmark-platform-key-123456"


class Usage(ctypes.Structure):
    _fields_ = [("uuid", ctypes.c_uint8 * 16)] + [
        (name, ctypes.c_uint64) for name in (
            "user", "system", "idle_wakeups", "interrupt_wakeups", "pageins",
            "wired", "resident", "footprint", "start", "exit", "child_user",
            "child_system", "child_idle", "child_interrupt", "child_pageins",
            "child_elapsed", "disk_read", "disk_written")]


class Timebase(ctypes.Structure):
    _fields_ = [("numer", ctypes.c_uint32), ("denom", ctypes.c_uint32)]


def timebase():
    result = Timebase()
    library = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    library.mach_timebase_info.argtypes = [ctypes.POINTER(Timebase)]
    library.mach_timebase_info.restype = ctypes.c_int
    if library.mach_timebase_info(ctypes.byref(result)) or not result.denom:
        raise RuntimeError("Mach clock timebase unavailable")
    return {"numer": result.numer, "denom": result.denom}


def clock_calibration():
    before = usage(os.getpid())
    r = resource.getrusage(resource.RUSAGE_SELF)
    previous = r.ru_utime + r.ru_stime
    target = time.process_time() + 0.1
    while time.process_time() < target:
        pass
    after = usage(os.getpid())
    r = resource.getrusage(resource.RUSAGE_SELF)
    expected = r.ru_utime + r.ru_stime - previous
    observed = (after["cpu_ns"] - before["cpu_ns"]) / 1e9
    if not 0.95 <= observed / expected <= 1.05:
        raise RuntimeError("CPU clock calibration disagrees with getrusage")
    return {"getrusage_seconds": expected, "converted_proc_seconds": observed}


def usage(pid):
    library = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    library.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    library.proc_pid_rusage.restype = ctypes.c_int
    result = Usage()
    if library.proc_pid_rusage(pid, 2, ctypes.byref(result)):
        raise OSError(ctypes.get_errno(), "proc_pid_rusage failed")
    clock = timebase()
    ticks = result.user + result.system
    return {"cpu_ticks": ticks, "cpu_ns": ticks * clock["numer"] / clock["denom"], "rss_bytes": result.resident,
            "footprint_bytes": result.footprint}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_digest():
    result = hashlib.sha256()
    paths = [ROOT / "Cargo.lock", ROOT / "Cargo.toml"]
    paths += sorted((ROOT / "crates").rglob("*.rs"))
    paths += sorted((ROOT / "crates").rglob("Cargo.toml"))
    paths += sorted((ROOT / "runner/connectors").rglob("manifest.json"))
    paths += sorted((ROOT / "migrations").glob("*.sql"))
    for path in paths:
        result.update(str(path.relative_to(ROOT)).encode())
        result.update(path.read_bytes())
    return result.hexdigest()


def query(port, path="/v1/connectors"):
    start = time.perf_counter_ns()
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", path, headers={"X-API-Key": KEY, "Connection": "close"})
        response = connection.getresponse()
        data = response.read(4 * 1024 * 1024 + 1)
        if response.status != 200 or len(data) > 4 * 1024 * 1024:
            raise RuntimeError(f"catalog request failed with HTTP {response.status}")
        return (time.perf_counter_ns() - start) / 1e6, data
    finally:
        connection.close()


class Runner(http.server.BaseHTTPRequestHandler):
    calls = 0

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok","service":"synthetic-local-runner"}')

    def do_POST(self):
        type(self).calls += 1
        self.send_response(503)
        self.end_headers()
        self.wfile.write(b'{"error":"provider calls are forbidden in this benchmark"}')

    def log_message(self, *_args):
        pass


def percentile(values, quantile):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * quantile))]


def measure(name, binary, args, fixture, runner_port, psql):
    binary_sha_before = digest(binary)
    schema = "api_bench_" + uuid.uuid4().hex
    env = os.environ.copy()
    def sql(text, scoped=False):
        command_env = env.copy()
        if scoped:
            command_env["PGOPTIONS"] = f"-csearch_path={schema}"
        completed = subprocess.run([psql, args.database, "-X", "-v", "ON_ERROR_STOP=1", "-q"],
                                   input=text, text=True, env=command_env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if completed.returncode:
            raise RuntimeError("isolated PostgreSQL fixture operation failed")
    sql(f"CREATE SCHEMA {schema}")
    process = None
    log = None
    try:
        url = urllib.parse.urlsplit(args.database)
        parameters = urllib.parse.parse_qsl(url.query)
        parameters.append(("options", f"-csearch_path={schema}"))
        database = urllib.parse.urlunsplit(url._replace(query=urllib.parse.urlencode(parameters)))
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        child_env = {"PATH": str(fixture), "APPCALL_ENV": "development",
            "APPCALL_DEV_API_KEY": KEY, "APPCALL_DATABASE_URL": database,
            "APPCALL_SECRET_KEY": "01" * 32, "APPCALL_VAULT_MASTER_KEY": "01" * 32,
            "APPCALL_OAUTH_STATE_KEY": "01234567890123456789012345678901",
            "APPCALL_RUNNER_URL": f"http://127.0.0.1:{runner_port}",
            "APPCALL_RUNNER_TOKEN": "synthetic-local-runner-token",
            "APPCALL_HTTP_ADDR": f"127.0.0.1:{port}", "APPCALL_RUST_LISTEN": f"127.0.0.1:{port}",
            "APPCALL_CONNECTOR_DIR": str(ROOT / "runner/connectors"),
            "APPCALL_PUBLIC_BASE_URL": f"http://127.0.0.1:{port}",
            "APPCALL_SESSION_SECRET": "synthetic-benchmark-session-secret",
            "ANUSA_JWT_ACCESS_SECRET": "synthetic-benchmark-jwt-secret",
            "ANUSA_DATABASE_URL": database, "ANUSA_API_URL": f"http://127.0.0.1:{runner_port}",
            "APPCALL_WEBHOOK_SIGNING_SECRET": "synthetic-benchmark-webhook-secret",
            "APPCALL_RATE_LIMIT_RPS": "100000", "APPCALL_RATE_LIMIT_BURST": "100000"}
        log = open(fixture / f"{name}.log", "wb")
        process = subprocess.Popen([str(binary)], cwd=ROOT, env=child_env,
                                   stdout=log, stderr=log)
        ready = time.monotonic() + 20
        while True:
            if process.poll() is not None:
                raise RuntimeError(f"{name} exited before readiness; inspect local synthetic log")
            try:
                query(port, "/readyz")
                break
            except (OSError, RuntimeError, http.client.HTTPException):
                if time.monotonic() > ready:
                    raise RuntimeError(f"{name} never became ready") from None
                time.sleep(0.1)
        _, body = query(port)
        catalog = json.loads(body)
        connectors = catalog["connectors"]
        keys = sorted(c["key"] for c in connectors)
        for _ in range(20):
            query(port)
        print(json.dumps({"phase": "settle", "name": name, "seconds": args.settle}), flush=True)
        time.sleep(args.settle)
        before = usage(process.pid)
        started = time.monotonic()
        print(json.dumps({"phase": "idle", "name": name, "seconds": args.idle_seconds}), flush=True)
        time.sleep(args.idle_seconds)
        elapsed = time.monotonic() - started
        after = usage(process.pid)
        print(json.dumps({"phase": "catalog", "name": name, "requests": args.requests}), flush=True)
        started = time.perf_counter()
        def load(worker):
            return [query(port)[0] for _ in range(worker, args.requests, args.concurrency)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            samples = [latency for batch in pool.map(load, range(args.concurrency)) for latency in batch]
        duration = time.perf_counter() - started
        return {"name": name, "binary_sha256": binary_sha_before,
                "binary_changed_during_measurement": digest(binary) != binary_sha_before, "binary_bytes": binary.stat().st_size,
                "idle_seconds": elapsed, "rss_before_bytes": before["rss_bytes"],
                "rss_after_bytes": after["rss_bytes"], "footprint_after_bytes": after["footprint_bytes"],
                "idle_cpu_mach_ticks": after["cpu_ticks"] - before["cpu_ticks"],
                "idle_cpu_seconds": (after["cpu_ns"] - before["cpu_ns"]) / 1e9,
                "idle_cpu_percent_single_core": (after["cpu_ns"] - before["cpu_ns"]) / 1e9 / elapsed * 100,
                "catalog_keys": keys, "catalog_response_bytes": len(body),
                "catalog_semantic_sha256": hashlib.sha256(json.dumps(catalog, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
                "requests": args.requests, "concurrency": args.concurrency,
                "wall_seconds": duration, "requests_per_second": args.requests / duration,
                "latency_ms": {"median": statistics.median(samples), "p95": percentile(samples, .95),
                               "p99": percentile(samples, .99), "max": max(samples)}}
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=70)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if log is not None:
            log.close()
        sql(f"DROP SCHEMA {schema} CASCADE")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="Explicit disposable local PostgreSQL URL")
    parser.add_argument("--rust-binary", type=pathlib.Path, required=True)
    parser.add_argument("--baseline-binary", type=pathlib.Path, help="Optional prebuilt external reference; never built by this harness")
    parser.add_argument("--baseline-label", default="external-baseline")
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--idle-seconds", type=float, default=60)
    parser.add_argument("--settle", type=float, default=5)
    parser.add_argument("--requests", type=int, default=400)
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()
    if platform.system() != "Darwin":
        parser.error("this harness requires macOS proc_pid_rusage; do not substitute coarse ps CPU")
    database = urllib.parse.urlsplit(args.database)
    if database.scheme not in ("postgres", "postgresql") or database.hostname not in ("localhost", "127.0.0.1", "::1"):
        parser.error("only an explicit loopback PostgreSQL fixture is permitted")
    if any(key in ("host", "hostaddr", "service") for key, _ in urllib.parse.parse_qsl(database.query)):
        parser.error("database query must not override the loopback host")
    if not 1 <= len(args.baseline_label) <= 64 or not all(c.isalnum() or c in "-_" for c in args.baseline_label):
        parser.error("baseline label must be a simple identifier")
    if not math.isfinite(args.idle_seconds) or not math.isfinite(args.settle) or args.idle_seconds <= 0 or args.settle < 0 or not 1 <= args.requests <= 100000 or not 1 <= args.concurrency <= 16:
        parser.error("invalid benchmark bounds")
    psql = shutil.which("psql")
    if not psql:
        parser.error("psql must be available")
    calibration = clock_calibration()
    initial = source_digest()
    runner = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Runner)
    threading.Thread(target=runner.serve_forever, daemon=True).start()
    result = {"platform": platform.platform(), "source_sha256": initial,
              "harness_sha256": digest(pathlib.Path(__file__)),
              "mach_timebase": timebase(), "clock_calibration": calibration,
              "started_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "logical_cpus": os.cpu_count(), "load_average_before": os.getloadavg(),
              "git_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "method": "native process proc_pid_rusage v2, Mach ticks converted with mach_timebase_info; one idle interval, then bounded concurrent authenticated catalog GET; Connection: close",
              "scope": "API process only; excludes PostgreSQL, synthetic runner, build and migration resources; development with browser auth configured; rate limit raised for handler measurement",
              "samples": []}
    try:
        with tempfile.TemporaryDirectory(prefix="appcall-api-benchmark-") as directory:
            fixture = pathlib.Path(directory)
            for name, binary in [("rust", args.rust_binary), (args.baseline_label, args.baseline_binary)]:
                if binary:
                    result["samples"].append(measure(name, binary.resolve(), args, fixture, runner.server_port, psql))
    finally:
        runner.shutdown()
        runner.server_close()
    result["load_average_after"] = os.getloadavg()
    result["runner_rpc_calls"] = Runner.calls
    result["source_changed_during_measurement"] = source_digest() != initial
    result["catalog_keys_match"] = len(result["samples"]) == 2 and result["samples"][0]["catalog_keys"] == result["samples"][1]["catalog_keys"]
    result["catalog_semantics_match"] = len(result["samples"]) == 2 and result["samples"][0]["catalog_semantic_sha256"] == result["samples"][1]["catalog_semantic_sha256"]
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "source_changed": result["source_changed_during_measurement"], "runner_rpc_calls": Runner.calls}), flush=True)
    if Runner.calls or result["source_changed_during_measurement"] or any(sample["binary_changed_during_measurement"] for sample in result["samples"]):
        raise SystemExit("measurement invalid: unexpected RPC or source/binary changed")


if __name__ == "__main__":
    main()
