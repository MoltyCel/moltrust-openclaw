/**
 * gateway_start hook handler.
 *
 * Two responsibilities:
 *   1. Connectivity probe — ping /health on startup, log result.
 *   2. Optional self-verification — if verifyOnStart && agentDid, call
 *      verifyDid for own DID, log verification status.
 *
 * Never throws or returns a blocking result; gateway_start is informational.
 * Errors are logged at warn level so operators see them in journalctl.
 */
import type { MolTrustClient } from "../client.js";
import type {
  GatewayStartContext,
  GatewayStartEvent,
  MolTrustConfig,
  OpenClawLogger,
} from "../openclaw-types.js";

export interface GatewayStartDeps {
  cfg: Required<MolTrustConfig>;
  client: Pick<MolTrustClient, "ping" | "verifyDid">;
  logger: OpenClawLogger;
}

export function makeGatewayStartHandler(deps: GatewayStartDeps) {
  const { cfg, client, logger } = deps;

  return async function gatewayStart(
    _event: GatewayStartEvent,
    _ctx: GatewayStartContext,
  ): Promise<void> {
    try {
      const health = await client.ping();
      logger.info(
        `[moltrust] API connectivity OK — ${health.version ?? "ok"}`,
      );
    } catch (err) {
      logger.warn(
        `[moltrust] API connectivity probe failed: ${(err as Error).message}`,
      );
    }

    if (cfg.verifyOnStart && cfg.agentDid) {
      try {
        const result = await client.verifyDid(cfg.agentDid);
        const tag = result.verified ? "✅ verified" : "❌ NOT verified";
        logger.info(`[moltrust] self-verification ${tag} (${cfg.agentDid})`);
      } catch (err) {
        logger.warn(
          `[moltrust] self-verification failed: ${(err as Error).message}`,
        );
      }
    }
  };
}
