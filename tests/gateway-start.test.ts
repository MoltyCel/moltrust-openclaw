import { describe, expect, it, vi } from "vitest";
import { makeGatewayStartHandler } from "../src/hooks/gateway-start.js";
import { DEFAULT_CONFIG } from "../src/openclaw-types.js";

const stubLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("gateway_start", () => {
  it("logs warn (not throw) when connectivity probe fails", async () => {
    const logger = stubLogger();
    const client = {
      async ping() {
        throw new Error("boom");
      },
      async verifyDid() {
        return { did: "x", verified: true };
      },
    };
    const h = makeGatewayStartHandler({
      cfg: { ...DEFAULT_CONFIG },
      client,
      logger,
    });
    await expect(h({}, {})).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("connectivity"),
    );
  });

  it("runs self-verify when verifyOnStart=true and agentDid set", async () => {
    const logger = stubLogger();
    const verifyDid = vi
      .fn()
      .mockResolvedValue({ did: "did:moltrust:self", verified: true });
    const client = {
      async ping() {
        return { version: "v2.4" };
      },
      verifyDid,
    };
    const h = makeGatewayStartHandler({
      cfg: {
        ...DEFAULT_CONFIG,
        verifyOnStart: true,
        agentDid: "did:moltrust:self",
      },
      client,
      logger,
    });
    await h({}, {});
    expect(verifyDid).toHaveBeenCalledWith("did:moltrust:self");
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("self-verification ✅"),
    );
  });

  it("skips self-verify when verifyOnStart=false", async () => {
    const logger = stubLogger();
    const verifyDid = vi.fn();
    const client = {
      async ping() {
        return { version: "v2.4" };
      },
      verifyDid,
    };
    const h = makeGatewayStartHandler({
      cfg: { ...DEFAULT_CONFIG, agentDid: "did:moltrust:self" },
      client,
      logger,
    });
    await h({}, {});
    expect(verifyDid).not.toHaveBeenCalled();
  });
});
