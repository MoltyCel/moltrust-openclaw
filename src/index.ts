/**
 * @moltrust/openclaw v2 — entry.
 *
 * Wires the four lifecycle hooks (before_install, before_tool_call,
 * inbound_claim, gateway_start) plus the v1 surface (tools, slash commands,
 * gateway RPC, CLI).
 *
 * Hook handlers live in src/hooks/ — each exposes a makeXxxHandler(deps)
 * factory so they're independently unit-testable without an OpenClaw host.
 */
import { MolTrustClient } from "./client.js";
import { makeBeforeInstallHandler } from "./hooks/before-install.js";
import { makeBeforeToolCallHandler } from "./hooks/before-tool-call.js";
import { makeGatewayStartHandler } from "./hooks/gateway-start.js";
import { makeInboundClaimHandler } from "./hooks/inbound-claim.js";
import {
  DEFAULT_CONFIG,
  type MolTrustConfig,
  type OpenClawPluginApi,
} from "./openclaw-types.js";

function gradeColor(score: number): string {
  if (score >= 80) return "🟢";
  if (score >= 60) return "🟡";
  if (score >= 40) return "🟠";
  return "🔴";
}

function resolveConfig(api: OpenClawPluginApi): Required<MolTrustConfig> {
  const fromPluginConfig = (api.pluginConfig as MolTrustConfig | undefined) ?? {};
  const fromConfigEntries =
    (api.config?.plugins?.entries?.moltrust?.config as MolTrustConfig | undefined) ??
    {};
  return { ...DEFAULT_CONFIG, ...fromConfigEntries, ...fromPluginConfig };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  const client = new MolTrustClient(cfg);
  const logger = api.logger;

  // ── Lifecycle hooks (v2) ───────────────────────────────────────────────
  api.on(
    "before_install",
    makeBeforeInstallHandler({ cfg, logger }),
  );
  api.on(
    "before_tool_call",
    makeBeforeToolCallHandler({ cfg, client, logger }),
  );
  api.on(
    "inbound_claim",
    makeInboundClaimHandler({ cfg, client, logger }),
  );
  api.on(
    "gateway_start",
    makeGatewayStartHandler({ cfg, client, logger }),
  );

  // ── v1 surface preserved: tools / commands / RPC / CLI ─────────────────
  api.registerTool?.({
    name: "moltrust_verify",
    description:
      "Verify an AI agent's W3C DID identity against MolTrust. Returns verified status, trust score, and Verifiable Credential details.",
    parameters: {
      type: "object",
      required: ["did"],
      properties: {
        did: { type: "string", description: "DID to verify, e.g. did:moltrust:abc123" },
      },
    },
    handler: async (args) => {
      const did = String((args as { did?: unknown }).did ?? "");
      try {
        const r = await client.verifyDid(did);
        const out: string[] = [
          r.verified ? "✅ Agent verified" : "❌ Agent NOT verified",
          `DID: \`${r.did}\``,
        ];
        if (r.message) out.push(r.message);
        if (r.credential) {
          out.push(
            `Credential: ${r.credential.type}`,
            `Issuer: ${r.credential.issuer}`,
            `Issued: ${r.credential.issuanceDate}`,
          );
        }
        if (r.trustScore !== undefined) {
          out.push(
            `Trust Score: ${r.trustScore}/100 ${gradeColor(r.trustScore)}`,
          );
        }
        return out.join("\n");
      } catch (err) {
        return `❌ MolTrust verify failed: ${(err as Error).message}`;
      }
    },
  });

  api.registerTool?.({
    name: "moltrust_trust_score",
    description:
      "Get the MolTrust trust score (0-100) for an AI agent by DID or wallet address. Includes sybil detection and behavioral history.",
    parameters: {
      type: "object",
      required: ["identifier"],
      properties: {
        identifier: { type: "string", description: "DID or 0x EVM address" },
      },
    },
    handler: async (args) => {
      const identifier = String((args as { identifier?: unknown }).identifier ?? "");
      try {
        if (identifier.startsWith("0x")) {
          const r = await client.getWalletScoreFree(identifier);
          return `${gradeColor(r.score)} Score: ${r.score}/100 (${r.grade}) — wallet ${r.address}`;
        }
        const r = await client.getTrustScore(identifier);
        return `${gradeColor(r.score)} ${r.did} → ${r.score}/100 (${r.grade})`;
      } catch (err) {
        return `❌ MolTrust trust score failed: ${(err as Error).message}`;
      }
    },
  });

  api.registerTool?.({
    name: "moltrust_endorse",
    description:
      "Endorse another agent's skill via MolTrust SkillEndorsementCredential (W3C VC, 90-day expiry). Requires apiKey in plugin config.",
    parameters: {
      type: "object",
      required: ["endorsed_did", "skill", "evidence_hash", "vertical"],
      properties: {
        endorsed_did: { type: "string", description: "DID of the agent being endorsed" },
        skill: { type: "string", description: "Skill being endorsed (free-text label)" },
        evidence_hash: {
          type: "string",
          description: "SHA-256 of the interaction proof / artefact backing the endorsement",
        },
        vertical: {
          type: "string",
          description: "MolTrust vertical (shopping, travel, sports, prediction, salesguard, ...)",
        },
        evidence_timestamp: {
          type: "string",
          description: "ISO 8601 timestamp; defaults to now() if omitted",
        },
      },
    },
    handler: async (args) => {
      const a = args as {
        endorsed_did?: string;
        skill?: string;
        evidence_hash?: string;
        vertical?: string;
        evidence_timestamp?: string;
      };
      try {
        const r = await client.endorse({
          endorsed_did: String(a.endorsed_did ?? ""),
          skill: String(a.skill ?? ""),
          evidence_hash: String(a.evidence_hash ?? ""),
          vertical: String(a.vertical ?? ""),
          evidence_timestamp: a.evidence_timestamp ?? new Date().toISOString(),
        });
        const idTag = r.id ? ` (id ${r.id})` : "";
        return `✅ Endorsed ${a.endorsed_did} for ${a.skill}${idTag}`;
      } catch (err) {
        return `❌ MolTrust endorse failed: ${(err as Error).message}`;
      }
    },
  });

  api.registerCommand?.({
    name: "trust",
    description: "Verify an agent DID. Usage: /trust did:moltrust:...",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const did = (ctx.args ?? "").trim();
      if (!did) return { text: "Usage: /trust <DID>" };
      try {
        const r = await client.verifyDid(did);
        const score =
          r.trustScore !== undefined
            ? ` | Score: ${r.trustScore}/100 ${gradeColor(r.trustScore)}`
            : "";
        return {
          text: `${r.verified ? "✅ Verified" : "❌ Not verified"}${score}\n${r.message ?? ""}`,
        };
      } catch (err) {
        return { text: `MolTrust error: ${(err as Error).message}` };
      }
    },
  });

  api.registerCommand?.({
    name: "trustscore",
    description: "Get trust score for a DID or wallet. Usage: /trustscore <id>",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const id = (ctx.args ?? "").trim();
      if (!id) return { text: "Usage: /trustscore <DID or 0x...>" };
      try {
        if (id.startsWith("0x")) {
          const r = await client.getWalletScoreFree(id);
          return {
            text: `${gradeColor(r.score)} ${r.score}/100 (${r.grade}) — ${r.address}`,
          };
        }
        const r = await client.getTrustScore(id);
        return { text: `${gradeColor(r.score)} ${r.did} → ${r.score}/100 (${r.grade})` };
      } catch (err) {
        return { text: `MolTrust error: ${(err as Error).message}` };
      }
    },
  });

  api.registerGatewayMethod?.("moltrust.status", async ({ respond }) => {
    try {
      const health = await client.ping();
      respond(true, {
        ok: true,
        api: health,
        version: "2.0.0",
        config: {
          apiUrl: cfg.apiUrl,
          hasApiKey: Boolean(cfg.apiKey),
          minTrustScore: cfg.minTrustScore,
          gateAllTools: cfg.gateAllTools,
          sensitivePrefixes: cfg.sensitivePrefixes,
          installAllowlistSize: cfg.installAllowlist.length,
          installBlocklistSize: cfg.installBlocklist.length,
          agentDid: cfg.agentDid || null,
        },
      });
    } catch (err) {
      respond(false, { ok: false, error: (err as Error).message });
    }
  });

  api.registerGatewayMethod?.("moltrust.verify", async ({ params, respond }) => {
    const did = typeof params?.did === "string" ? params.did : undefined;
    if (!did) {
      respond(false, { error: "did is required" });
      return;
    }
    try {
      const result = await client.verifyDid(did);
      respond(true, result);
    } catch (err) {
      respond(false, { error: (err as Error).message });
    }
  });

  api.registerCli?.(
    ({ program }) => {
      // Commander-compatible registration. Use loose typing here because
      // the host-provided program object isn't known at compile time.
      const p = program as {
        command: (name: string) => {
          description: (d: string) => unknown;
          command: (name: string) => {
            description: (d: string) => unknown;
            action: (fn: (...args: unknown[]) => Promise<void> | void) => unknown;
          };
        };
      };
      const cmd = p.command("moltrust");
      (cmd as { description: (d: string) => unknown }).description(
        "MolTrust trust operations",
      );
      (cmd as { command: (n: string) => { description: (d: string) => unknown; action: (fn: (...args: unknown[]) => Promise<void>) => unknown } }).command(
        "status",
      ).action(async () => {
        try {
          const h = await client.ping();
          // eslint-disable-next-line no-console
          console.log(`✅ MolTrust API OK — ${h.version ?? "ok"}`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`❌ ${(err as Error).message}`);
          process.exit(1);
        }
      });
      (cmd as { command: (n: string) => { description: (d: string) => unknown; action: (fn: (...args: unknown[]) => Promise<void>) => unknown } }).command(
        "verify <did>",
      ).action(async (did: unknown) => {
        try {
          const r = await client.verifyDid(String(did));
          // eslint-disable-next-line no-console
          console.log(r.verified ? "✅ Verified" : "❌ Not verified");
          if (r.message) console.log(r.message);
          if (r.trustScore !== undefined) console.log(`Trust Score: ${r.trustScore}/100`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      });
      (cmd as { command: (n: string) => { description: (d: string) => unknown; action: (fn: (...args: unknown[]) => Promise<void>) => unknown } }).command(
        "score <id>",
      ).action(async (id: unknown) => {
        const idStr = String(id);
        try {
          if (idStr.startsWith("0x")) {
            const r = await client.getWalletScoreFree(idStr);
            // eslint-disable-next-line no-console
            console.log(`Score: ${r.score}/100 (${r.grade})`);
          } else {
            const r = await client.getTrustScore(idStr);
            // eslint-disable-next-line no-console
            console.log(`Score: ${r.score}/100 (${r.grade})`);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }
      });
    },
    { commands: ["moltrust"] },
  );

  logger.info(
    "[moltrust] v2 plugin registered — hooks: before_install, before_tool_call, inbound_claim, gateway_start",
  );
}
