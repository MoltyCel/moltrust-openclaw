/**
 * @moltrust/openclaw — MolTrust trust verification plugin for OpenClaw
 *
 * Registers:
 *   - Agent tools: moltrust_verify, moltrust_trust_score, moltrust_issue_vc
 *   - Slash commands: /trust, /trustscore
 *   - Background service: moltrust-monitor
 *   - Gateway RPC: moltrust.status, moltrust.verify
 *   - CLI command: openclaw moltrust
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface MolTrustConfig {
  apiKey?: string;
  apiUrl?: string;
  minTrustScore?: number;
  verifyOnStart?: boolean;
  agentDid?: string;
}

/** Matches GET /skill/trust-score/{did} response */
interface TrustScoreResult {
  did: string;
  trust_score: number | null;
  grade: string;
  breakdown: {
    direct_score: number;
    propagated_score: number;
    cross_vertical_bonus: number;
    interaction_bonus: number;
    sybil_penalty: number;
    computation_method: string;
  };
  endorser_count: number;
  withheld: boolean;
  flags: string[];
  flag_count: number;
  computed_at: string | null;
  cache_valid_until: string | null;
}

/** Matches GET /identity/verify/{did} response */
interface VerifyResult {
  did: string;
  verified: boolean;
  reputation: number;
}

/** Matches GET /reputation/query/{did} response */
interface ReputationResult {
  did: string;
  score: number;
  total_ratings: number;
}

// ─── API Client ───────────────────────────────────────────────────────────────

class MolTrustClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: MolTrustConfig) {
    this.apiKey = config.apiKey ?? "";
    this.baseUrl = config.apiUrl ?? "https://api.moltrust.ch";
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "moltrust-openclaw/0.1.0",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`MolTrust API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /** Verify a DID — no API key needed for basic check */
  async verifyDid(did: string): Promise<VerifyResult> {
    return this.request<VerifyResult>(`/identity/verify/${encodeURIComponent(did)}`);
  }

  /** Get trust score for a DID */
  async getTrustScore(did: string): Promise<TrustScoreResult> {
    return this.request<TrustScoreResult>(`/skill/trust-score/${encodeURIComponent(did)}`);
  }

  /** Get reputation (ratings) for a DID */
  async getReputation(did: string): Promise<ReputationResult> {
    return this.request<ReputationResult>(`/reputation/query/${encodeURIComponent(did)}`);
  }

  /** Check if API key is valid */
  async ping(): Promise<{ status: string; version: string }> {
    return this.request("/health");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getConfig(api: any): MolTrustConfig {
  return api.config?.plugins?.entries?.moltrust?.config ?? {};
}

function gradeColor(score: number): string {
  if (score >= 80) return "🟢";
  if (score >= 60) return "🟡";
  if (score >= 40) return "🟠";
  return "🔴";
}

function formatTrustResult(result: TrustScoreResult): string {
  const score = result.trust_score ?? 0;
  const icon = gradeColor(score);
  const lines = [
    `${icon} **MolTrust Score: ${result.withheld ? "withheld" : `${score}/100`} (${result.grade})**`,
    `DID: \`${result.did}\``,
    `Endorsers: ${result.endorser_count}`,
    `Sybil Penalty: ${result.breakdown.sybil_penalty}`,
    `Method: ${result.breakdown.computation_method}`,
  ];
  if (result.flags.length > 0) {
    lines.push(`Flags: ${result.flags.join(", ")}`);
  }
  if (result.computed_at) {
    lines.push(`Updated: ${result.computed_at}`);
  }
  lines.push(`🔗 https://moltrust.ch`);
  return lines.join("\n");
}

// ─── Plugin Entry ────────────────────────────────────────────────────────────

export default function register(api: any) {
  const cfg = getConfig(api);
  const client = new MolTrustClient(cfg);

  // ── Agent Tool: moltrust_verify ──────────────────────────────────────────
  api.registerTool({
    name: "moltrust_verify",
    description:
      "Verify an AI agent's W3C DID identity against MolTrust trust infrastructure. " +
      "Returns verified status, trust score, and Verifiable Credential details. " +
      "Use this before trusting another agent with sensitive tasks or payments.",
    parameters: {
      type: "object",
      required: ["did"],
      properties: {
        did: {
          type: "string",
          description: "The DID to verify, e.g. did:moltrust:abc123 or did:key:z6Mk...",
        },
      },
    },
    handler: async ({ did }: { did: string }) => {
      try {
        const result = await client.verifyDid(did);
        const lines = [
          result.verified ? "✅ **Agent verified**" : "❌ **Agent NOT verified**",
          `DID: \`${result.did}\``,
          `Reputation: ${result.reputation}/5`,
        ];
        return lines.join("\n");
      } catch (err: any) {
        return `❌ MolTrust verify failed: ${err.message}`;
      }
    },
  });

  // ── Agent Tool: moltrust_trust_score ─────────────────────────────────────
  api.registerTool({
    name: "moltrust_trust_score",
    description:
      "Get the MolTrust trust score (0–100) for an AI agent by DID or wallet address. " +
      "Includes sybil detection, on-chain behavior analysis, and reputation signals. " +
      "Scores above 80 are trusted; below 40 are high risk.",
    parameters: {
      type: "object",
      required: ["identifier"],
      properties: {
        identifier: {
          type: "string",
          description: "DID (did:moltrust:...) or EVM wallet address (0x...)",
        },
      },
    },
    handler: async ({ identifier }: { identifier: string }) => {
      try {
        if (identifier.startsWith("0x")) {
          return `❌ Wallet scoring not yet available. Use a DID (did:moltrust:...) instead.`;
        } else {
          const result = await client.getTrustScore(identifier);
          return formatTrustResult(result);
        }
      } catch (err: any) {
        return `❌ MolTrust trust score failed: ${err.message}`;
      }
    },
  });

  // ── Slash Command: /trust ─────────────────────────────────────────────────
  api.registerCommand({
    name: "trust",
    description: "Verify an agent DID via MolTrust. Usage: /trust did:moltrust:...",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: any) => {
      const did = ctx.args?.trim();
      if (!did) {
        return { text: "Usage: /trust <DID>\nExample: /trust did:moltrust:abc123" };
      }
      try {
        const result = await client.verifyDid(did);
        const status = result.verified ? "✅ Verified" : "❌ Not verified";
        const rep = result.reputation > 0 ? ` | Reputation: ${result.reputation}/5` : "";
        return { text: `${status}${rep}\n${result.did}` };
      } catch (err: any) {
        return { text: `MolTrust error: ${err.message}` };
      }
    },
  });

  // ── Slash Command: /trustscore ────────────────────────────────────────────
  api.registerCommand({
    name: "trustscore",
    description: "Get trust score for a DID or wallet. Usage: /trustscore 0x... or /trustscore did:...",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: any) => {
      const identifier = ctx.args?.trim();
      if (!identifier) {
        return { text: "Usage: /trustscore <DID or wallet address>" };
      }
      try {
        if (identifier.startsWith("0x")) {
          return { text: "Wallet scoring not yet available. Use a DID (did:moltrust:...) instead." };
        } else {
          const result = await client.getTrustScore(identifier);
          return { text: formatTrustResult(result) };
        }
      } catch (err: any) {
        return { text: `MolTrust error: ${err.message}` };
      }
    },
  });

  // ── Gateway RPC: moltrust.status ──────────────────────────────────────────
  api.registerGatewayMethod("moltrust.status", async ({ respond }: any) => {
    try {
      const health = await client.ping();
      respond(true, {
        ok: true,
        api: health,
        config: {
          apiUrl: cfg.apiUrl ?? "https://api.moltrust.ch",
          hasApiKey: Boolean(cfg.apiKey),
          minTrustScore: cfg.minTrustScore ?? 0,
          agentDid: cfg.agentDid ?? null,
        },
      });
    } catch (err: any) {
      respond(false, { ok: false, error: err.message });
    }
  });

  // ── Gateway RPC: moltrust.verify ──────────────────────────────────────────
  api.registerGatewayMethod("moltrust.verify", async ({ params, respond }: any) => {
    const did = params?.did;
    if (!did) {
      respond(false, { error: "did is required" });
      return;
    }
    try {
      const result = await client.verifyDid(did);
      respond(true, result);
    } catch (err: any) {
      respond(false, { error: err.message });
    }
  });

  // ── CLI command: openclaw moltrust ────────────────────────────────────────
  api.registerCli(
    ({ program }: any) => {
      const cmd = program.command("moltrust").description("MolTrust trust operations");

      cmd
        .command("status")
        .description("Check MolTrust API connectivity")
        .action(async () => {
          try {
            const health = await client.ping();
            console.log(`✅ MolTrust API OK — ${health.version}`);
          } catch (err: any) {
            console.error(`❌ MolTrust API unreachable: ${err.message}`);
            process.exit(1);
          }
        });

      cmd
        .command("verify <did>")
        .description("Verify an agent DID")
        .action(async (did: string) => {
          try {
            const result = await client.verifyDid(did);
            console.log(result.verified ? "✅ Verified" : "❌ Not verified");
            console.log(`DID: ${result.did}`);
            console.log(`Reputation: ${result.reputation}/5`);
          } catch (err: any) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
          }
        });

      cmd
        .command("score <identifier>")
        .description("Get trust score for DID or wallet address")
        .action(async (identifier: string) => {
          try {
            if (identifier.startsWith("0x")) {
              console.log("Wallet scoring not yet available. Use a DID instead.");
            } else {
              const result = await client.getTrustScore(identifier);
              const score = result.trust_score ?? 0;
              console.log(`Score: ${result.withheld ? "withheld" : `${score}/100`} (${result.grade})`);
              console.log(`Sybil Penalty: ${result.breakdown.sybil_penalty}`);
              console.log(`Endorsers: ${result.endorser_count}`);
            }
          } catch (err: any) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
          }
        });
    },
    { commands: ["moltrust"] }
  );

  // ── Background Service: moltrust-monitor ─────────────────────────────────
  let monitorInterval: ReturnType<typeof setInterval> | null = null;

  api.registerService({
    id: "moltrust-monitor",
    start: async () => {
      // Self-verify own DID on startup if configured
      if (cfg.verifyOnStart && cfg.agentDid) {
        try {
          const result = await client.verifyDid(cfg.agentDid);
          api.logger?.info(
            `[MolTrust] Self-verification: ${result.verified ? "✅ verified" : "❌ not verified"} (${cfg.agentDid})`
          );
        } catch (err: any) {
          api.logger?.warn(`[MolTrust] Self-verification failed: ${err.message}`);
        }
      }

      // Periodic health ping every 6 hours
      monitorInterval = setInterval(async () => {
        try {
          await client.ping();
          api.logger?.debug("[MolTrust] API health OK");
        } catch (err: any) {
          api.logger?.warn(`[MolTrust] API health check failed: ${err.message}`);
        }
      }, 6 * 60 * 60 * 1000);

      api.logger?.info("[MolTrust] Plugin started — trust verification ready");
    },
    stop: () => {
      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
      api.logger?.info("[MolTrust] Plugin stopped");
    },
  });
}
