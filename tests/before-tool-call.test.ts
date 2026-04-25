import { describe, expect, it, vi } from "vitest";
import { makeBeforeToolCallHandler } from "../src/hooks/before-tool-call.js";
import { DEFAULT_CONFIG } from "../src/openclaw-types.js";

const stubLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

function makeClient(scoreByDid: Record<string, number>) {
  return {
    async getTrustScore(did: string) {
      const score = scoreByDid[did];
      if (score === undefined) throw new Error(`unknown DID: ${did}`);
      return { did, score, grade: "X" };
    },
  };
}

type Block = { block?: boolean; blockReason?: string };

describe("before_tool_call", () => {
  it("skips moltrust_* own tools (no recursion)", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({ "did:moltrust:self": 5 }),
      logger: stubLogger(),
    });
    const r = await h({ toolName: "moltrust_verify", params: {} }, {});
    expect(r).toBeUndefined();
  });

  it("skips non-sensitive tools when gateAllTools=false", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({ "did:moltrust:self": 5 }),
      logger: stubLogger(),
    });
    const r = await h({ toolName: "safe_tool", params: {} }, {});
    expect(r).toBeUndefined();
  });

  it("skips entirely when minTrustScore<=0 (opt-in)", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({ "did:moltrust:self": 5 }),
      logger: stubLogger(),
    });
    const r = await h({ toolName: "pay_send", params: {} }, {});
    expect(r).toBeUndefined();
  });

  it("blocks sensitive call when own DID below threshold", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({ "did:moltrust:self": 10 }),
      logger: stubLogger(),
    });
    const r = (await h({ toolName: "pay_send", params: { to: "X" } }, {})) as
      | Block
      | undefined;
    expect(r?.block).toBe(true);
    expect(r?.blockReason).toContain("did:moltrust:self");
  });

  it("blocks when counterparty DID in params is below threshold", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({
        "did:moltrust:self": 90,
        "did:moltrust:bad": 10,
      }),
      logger: stubLogger(),
    });
    const r = (await h(
      {
        toolName: "pay_send",
        params: { to: "did:moltrust:bad", amount: 100 },
      },
      {},
    )) as Block | undefined;
    expect(r?.block).toBe(true);
    expect(r?.blockReason).toContain("did:moltrust:bad");
  });

  it("passes when both own and counterparty meet threshold", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({
        "did:moltrust:self": 90,
        "did:moltrust:peer": 80,
      }),
      logger: stubLogger(),
    });
    const r = await h(
      { toolName: "pay_send", params: { to: "did:moltrust:peer" } },
      {},
    );
    expect(r).toBeUndefined();
  });

  it("gateAllTools=true gates non-prefix tools too", async () => {
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        gateAllTools: true,
        agentDid: "did:moltrust:self",
      },
      client: makeClient({ "did:moltrust:self": 10 }),
      logger: stubLogger(),
    });
    const r = (await h({ toolName: "innocent_tool", params: {} }, {})) as
      | Block
      | undefined;
    expect(r?.block).toBe(true);
  });

  it("fails open on lookup error (warns but does not block)", async () => {
    const logger = stubLogger();
    const h = makeBeforeToolCallHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        minTrustScore: 50,
        agentDid: "did:moltrust:unknown",
      },
      client: makeClient({}),
      logger,
    });
    const r = await h({ toolName: "pay_send", params: {} }, {});
    expect(r).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("lookup failed"),
    );
  });
});
