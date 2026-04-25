/**
 * MolTrustClient — HTTP client + LRU cache (TTL) for verify / trust-score /
 * wallet-score lookups. Endorse + ping bypass cache.
 *
 * The cache is in-memory per process. Cache TTL defaults to 5 minutes.
 * Set cacheTtlMs to 0 in plugin config to disable caching entirely
 * (useful for tests).
 */
import type { MolTrustConfig } from "./openclaw-types.js";

export interface VerifyResult {
  did: string;
  verified: boolean;
  trustScore?: number;
  message?: string;
  credential?: {
    type: string;
    issuer: string;
    issuanceDate: string;
    expirationDate?: string;
  };
}

export interface TrustScoreResult {
  did: string;
  score: number;
  grade: string;
  verifications?: string[];
  sybilRisk?: string;
  lastUpdated?: string;
}

export interface WalletScoreResult {
  address: string;
  score: number;
  grade: string;
}

export interface EndorseRequest {
  endorsed_did: string;
  skill: string;
  evidence_hash: string;
  evidence_timestamp: string;
  vertical: string;
}

export interface EndorseResult {
  id?: string;
  status?: string;
  [k: string]: unknown;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 500,
  ) {}

  get(key: string): T | undefined {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Mark as MRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.ttlMs <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
}

export class MolTrustClient {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private verifyCache: LRUCache<VerifyResult>;
  private scoreCache: LRUCache<TrustScoreResult>;
  private walletCache: LRUCache<WalletScoreResult>;

  constructor(cfg: MolTrustConfig, opts: ClientOptions = {}) {
    this.apiKey = cfg.apiKey ?? "";
    this.baseUrl = (cfg.apiUrl ?? "https://api.moltrust.ch").replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const ttl = cfg.cacheTtlMs ?? 300_000;
    this.verifyCache = new LRUCache<VerifyResult>(ttl);
    this.scoreCache = new LRUCache<TrustScoreResult>(ttl);
    this.walletCache = new LRUCache<WalletScoreResult>(ttl);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "moltrust-openclaw/2.0.0",
    };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...((init.headers as Record<string, string>) ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `MolTrust API ${res.status}: ${body || res.statusText}`.slice(0, 400),
      );
    }
    return (await res.json()) as T;
  }

  async verifyDid(did: string): Promise<VerifyResult> {
    const cached = this.verifyCache.get(did);
    if (cached) return cached;
    const result = await this.request<VerifyResult>(
      `/identity/verify/${encodeURIComponent(did)}`,
    );
    this.verifyCache.set(did, result);
    return result;
  }

  async getTrustScore(did: string): Promise<TrustScoreResult> {
    const cached = this.scoreCache.get(did);
    if (cached) return cached;
    const result = await this.request<TrustScoreResult>(
      `/skill/trust-score/${encodeURIComponent(did)}`,
    );
    this.scoreCache.set(did, result);
    return result;
  }

  async getWalletScoreFree(address: string): Promise<WalletScoreResult> {
    const cached = this.walletCache.get(address);
    if (cached) return cached;
    const result = await this.request<WalletScoreResult>(
      `/guard/api/agent/score-free/${encodeURIComponent(address)}`,
    );
    this.walletCache.set(address, result);
    return result;
  }

  async ping(): Promise<{ status?: string; version?: string }> {
    return this.request<{ status?: string; version?: string }>("/health");
  }

  async endorse(req: EndorseRequest): Promise<EndorseResult> {
    if (!this.apiKey) throw new Error("endorse requires apiKey to be set in plugin config");
    return this.request<EndorseResult>("/skill/endorse", {
      method: "POST",
      body: JSON.stringify({ ...req, api_key: this.apiKey }),
    });
  }

  // Test helpers — not part of public surface
  __clearCachesForTest(): void {
    this.verifyCache.clear();
    this.scoreCache.clear();
    this.walletCache.clear();
  }
}
