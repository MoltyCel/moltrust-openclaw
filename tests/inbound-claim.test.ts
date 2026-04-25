import { describe, expect, it, vi } from "vitest";
import { makeInboundClaimHandler } from "../src/hooks/inbound-claim.js";
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

describe("inbound_claim", () => {
  it("returns undefined when minTrustScore=0 (opt-in)", async () => {
    const h = makeInboundClaimHandler({
      cfg: { ...DEFAULT_CONFIG },
      client: makeClient({}),
      logger: stubLogger(),
    });
    const r = await h({ metadata: { did: "did:moltrust:any" } }, {});
    expect(r).toBeUndefined();
  });

  it("blocks low-score sender via metadata.did", async () => {
    const h = makeInboundClaimHandler({
      cfg: { ...DEFAULT_CONFIG, minTrustScore: 50 },
      client: makeClient({ "did:moltrust:bad": 10 }),
      logger: stubLogger(),
    });
    const r = await h({ metadata: { did: "did:moltrust:bad" } }, {});
    expect(r?.handled).toBe(true);
    expect(r?.reply?.content).toContain("did:moltrust:bad");
    expect(r?.reply?.content).toContain("blocked");
  });

  it("falls back to senderId when metadata.did is missing and senderId looks like DID", async () => {
    const h = makeInboundClaimHandler({
      cfg: { ...DEFAULT_CONFIG, minTrustScore: 50 },
      client: makeClient({ "did:moltrust:bad2": 5 }),
      logger: stubLogger(),
    });
    const r = await h({ senderId: "did:moltrust:bad2" }, {});
    expect(r?.handled).toBe(true);
  });

  it("ignores senderId that is not a DID and there's no metadata.did", async () => {
    const h = makeInboundClaimHandler({
      cfg: { ...DEFAULT_CONFIG, minTrustScore: 50 },
      client: makeClient({}),
      logger: stubLogger(),
    });
    const r = await h({ senderId: "alice@example.com" }, {});
    expect(r).toBeUndefined();
  });
});
