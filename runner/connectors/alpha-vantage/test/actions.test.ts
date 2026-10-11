import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers });

describe("alpha-vantage declarative Composio contract", () => {
  test("compiles every declared action with a request block", () => {
    const compiled = Object.keys(actions).sort();
    const declared = Object.entries(manifest.operations)
      .filter(([, op]) => (op as { kind: string }).kind === "action" && (op as { request?: unknown }).request)
      .map(([key]) => key)
      .sort();
    expect(compiled).toEqual(declared);
    expect(compiled.length).toBe(Object.keys(manifest.operations).length);
  });

  test("healthcheck sends apikey and maps MARKET_STATUS", async () => {
    const seen: Request[] = [];
    const body = { endpoint: "Global Market Open & Close Status", markets: [] };
    const result = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(body);
      },
    });
    expect(seen[0].url).toBe("https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(result).toMatchObject({ connector: "alpha-vantage", action: "healthcheck", source: "provider", data: body });
  });

  test("omits optional query parameters and keeps required FX pair fields", async () => {
    const seen: Request[] = [];
    await actions["fx.daily"]!({
      apiKey: "secret",
      from_symbol: "EUR",
      to_symbol: "USD",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ "Time Series FX (Daily)": {} });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("function")).toBe("FX_DAILY");
    expect(url.searchParams.get("from_symbol")).toBe("EUR");
    expect(url.searchParams.get("to_symbol")).toBe("USD");
    expect(url.searchParams.get("apikey")).toBe("secret");
    expect(url.searchParams.has("outputsize")).toBe(false);
    expect(url.searchParams.has("datatype")).toBe(false);
  });

  test("maps analytics fields onto documented uppercase query names", async () => {
    const seen: Request[] = [];
    await actions["intelligence.analytics_sliding_window"]!({
      apiKey: "secret",
      symbols: "IBM,AAPL",
      RANGE: "2023-01-01,2023-12-31",
      interval: "DAILY",
      window_size: 20,
      calculations: "MEAN,STDDEV",
      ohlc: "close",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ payload: true });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("function")).toBe("ANALYTICS_SLIDING_WINDOW");
    expect(url.searchParams.get("SYMBOLS")).toBe("IBM,AAPL");
    expect(url.searchParams.get("RANGE")).toBe("2023-01-01,2023-12-31");
    expect(url.searchParams.get("INTERVAL")).toBe("DAILY");
    expect(url.searchParams.get("WINDOW_SIZE")).toBe("20");
    expect(url.searchParams.get("CALCULATIONS")).toBe("MEAN,STDDEV");
    expect(url.searchParams.get("OHLC")).toBe("close");
  });

  test("uses the selected technical indicator as the Alpha Vantage function", async () => {
    const seen: Request[] = [];
    await actions["technical.indicator"]!({
      apiKey: "secret",
      function: "RSI",
      symbol: "IBM",
      interval: "daily",
      series_type: "close",
      time_period: 14,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ "Technical Analysis: RSI": {} });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("function")).toBe("RSI");
    expect(url.searchParams.get("symbol")).toBe("IBM");
    expect(url.searchParams.get("interval")).toBe("daily");
    expect(url.searchParams.get("series_type")).toBe("close");
    expect(url.searchParams.get("time_period")).toBe("14");
  });

  test("rejects missing required input before network", async () => {
    let called = false;
    await expect(
      actions["quote.get"]!({
        apiKey: "secret",
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  test("maps HTTP 200 Information/Note/Error Message bodies to upstream errors", async () => {
    await expect(
      actions["series.daily"]!({
        apiKey: "secret",
        symbol: "IBM",
        fetch: async () => response({ Note: "Thank you for using Alpha Vantage! Please contact premium." }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions.healthcheck!({
        apiKey: "secret",
        fetch: async () => response({ Information: "rate limit" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps throttling without exposing credentials", async () => {
    await expect(
      actions.healthcheck!({
        apiKey: "secret",
        fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "7" }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });
});
