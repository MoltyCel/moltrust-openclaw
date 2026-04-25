/**
 * inbound_claim hook handler.
 *
 * Per openclaw hook-message.types.ts: returning {handled: true, reply: ...}
 * stops further claim processing and replies to the sender.
 *
 * Strategy:
 *   - extract sender DID: event.metadata?.did first, else senderId if it
 *     itself looks like a did:* string
 *   - if cfg.minTrustScore <= 0 → no-op
 *   - fetch trust score; if below threshold → return handled+warn-reply
 *
 * Failure mode: lookup errors fail-open (don't block message delivery on a
 * transient API failure).
 */
import type { MolTrustClient } from "../client.js";
import type {
  InboundClaimContext,
  InboundClaimEvent,
  InboundClaimResult,
  MolTrustConfig,
  OpenClawLogger,
} from "../openclaw-types.js";
import { isLikelyDid } from "../utils.js";

export interface InboundClaimDeps {
  cfg: Required<MolTrustConfig>;
  client: Pick<MolTrustClient, "getTrustScore">;
  logger: OpenClawLogger;
}

export function makeInboundClaimHandler(deps: InboundClaimDeps) {
  const { cfg, client, logger } = deps;

  return async function inboundClaim(
    event: InboundClaimEvent,
    _ctx: InboundClaimContext,
  ): Promise<InboundClaimResult | undefined> {
    if (cfg.minTrustScore <= 0) return undefined;

    const metaDid =
      typeof event.metadata?.did === "string" ? event.metadata.did : undefined;
    const senderDid =
      metaDid ?? (isLikelyDid(event.senderId) ? event.senderId : undefined);
    if (!senderDid) return undefined;

    try {
      const result = await client.getTrustScore(senderDid);
      if (result.score < cfg.minTrustScore) {
        const reason = `Inbound message from ${senderDid} blocked: trust score ${result.score} < ${cfg.minTrustScore}`;
        logger.warn(`[moltrust] ${reason}`);
        return { handled: true, reply: { content: `⚠️ ${reason}` } };
      }
    } catch (err) {
      logger.warn(
        `[moltrust] inbound DID ${senderDid} lookup failed: ${(err as Error).message}`,
      );
      // fail-open
    }
    return undefined;
  };
}
