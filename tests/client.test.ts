import { beforeEach, describe, expect, it, vi } from "vitest";
import { LRUCache, MolTrustClient } from "../src/client.js";

describe("LRUCache", () => {
  it("returns undefined for a missing key", () => {
    const c = new LRUCache<string>(1000);
    expect(c.get("nope")).toBeUndefined();
  });

  it("caches and retrieves a value within TTL", () => {
    const c = new LRUCache<string>(1000);
    c.set("a", "A");
    expect(c.get("a")).toBe("A");
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    try {
      const c = new LRUCache<string>(100);
      c.set("a", "A");
      vi.advanceTimersByTime(150);
      expect(c.get("a")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ttl=0 disables caching", () => {
    const c = new LRUCache<string>(0);
    c.set("a", "A");
    expect(c.get("a")).toBeUndefined();
  });
});

describe("MolTrustClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("caches verifyDid result within TTL (single network call for repeated lookup)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ did: "did:moltrust:a", verified: true }),
    );
    const client = new MolTrustClient(
      { cacheTtlMs: 5_000 },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    await client.verifyDid("did:moltrust:a");
    await client.verifyDid("did:moltrust:a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("endorse posts apiKey + payload and returns result", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "e1", status: "ok" }));
    const client = new MolTrustClient(
      { apiKey: "mt_live_xxx", cacheTtlMs: 0 },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    const r = await client.endorse({
      endorsed_did: "did:moltrust:b",
      skill: "cooking",
      evidence_hash: "sha256:deadbeef",
      evidence_timestamp: "2026-04-25T00:00:00Z",
      vertical: "shopping",
    });
    expect(r.id).toBe("e1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/skill/endorse");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.api_key).toBe("mt_live_xxx");
    expect(body.endorsed_did).toBe("did:moltrust:b");
    expect(body.skill).toBe("cooking");
  });

  it("endorse throws when apiKey is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const client = new MolTrustClient(
      {},
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    await expect(
      client.endorse({
        endorsed_did: "did:moltrust:x",
        skill: "s",
        evidence_hash: "h",
        evidence_timestamp: "t",
        vertical: "v",
      }),
    ).rejects.toThrow(/apiKey/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
