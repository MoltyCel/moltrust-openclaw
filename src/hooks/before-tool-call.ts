/**
 * before_tool_call hook handler.
 *
 * Two checks for sensitive tool calls:
 *   1. own agentDid score (if cfg.agentDid set) >= cfg.minTrustScore
 *   2. counterparty DIDs found in event.params (extracted via did:* regex)
 *      each have score >= cfg.minTrustScore
 *
 * Skipped when:
 *   - toolName starts with "moltrust_" (own tools — avoid recursion)
 *   - toolName not in any cfg.sensitivePrefixes AND cfg.gateAllTools is false
 *   - cfg.minTrustScore <= 0 (opt-in design)
 *
 * Failure mode: lookup errors fail-OPEN by design (warn-log, don't block).
 * Returns {block: true, blockReason} on actual policy violation.
 */
import type { MolTrustClient } from "../client.js";
import type {
  BeforeToolCallContext,
  BeforeToolCallEvent,
  BeforeToolCallResult,
  MolTrustConfig,
  OpenClawLogger,
} from "../openclaw-types.js";
import { extractDids } from "../utils.js";

export interface BeforeToolCallDeps {
  cfg: Required<MolTrustConfig>;
  client: Pick<MolTrustClient, "getTrustScore">;
  logger: OpenClawLogger;
}

function isSensitive(
  toolName: string,
  prefixes: string[],
  gateAll: boolean,
): boolean {
  if (gateAll) return true;
  return prefixes.some((p) => toolName.startsWith(p));
}

export function makeBeforeToolCallHandler(deps: BeforeToolCallDeps) {
  const { cfg, client, logger } = deps;

  return async function beforeToolCall(
    event: BeforeToolCallEvent,
    _ctx: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult> {
    const toolName = event.toolName;
    if (!toolName) return undefined;

    // Skip moltrust's own tools — avoid self-recursion
    if (toolName.startsWith("moltrust_")) return undefined;

    if (!isSensitive(toolName, cfg.sensitivePrefixes, cfg.gateAllTools)) {
      return undefined;
    }

    if (cfg.minTrustScore <= 0) return undefined;

    // Check 1: own agent DID
    if (cfg.agentDid) {
      try {
        const own = await client.getTrustScore(cfg.agentDid);
        if (own.score < cfg.minTrustScore) {
          const reason = `[moltrust] tool ${toolName} blocked: own agent ${cfg.agentDid} score ${own.score} < threshold ${cfg.minTrustScore}`;
          logger.warn(reason);
          return { block: true, blockReason: reason };
        }
      } catch (err) {
        logger.warn(
          `[moltrust] own DID score lookup failed: ${(err as Error).message}`,
        );
        // fail-open
      }
    }

    // Check 2: counterparty DIDs in params
    const counterparties = extractDids(event.params).filter(
      (d) => d !== cfg.agentDid,
    );
    for (const did of counterparties) {
      try {
        const score = await client.getTrustScore(did);
        if (score.score < cfg.minTrustScore) {
          const reason = `[moltrust] tool ${toolName} blocked: counterparty ${did} score ${score.score} < threshold ${cfg.minTrustScore}`;
          logger.warn(reason);
          return { block: true, blockReason: reason };
        }
      } catch (err) {
        logger.warn(
          `[moltrust] counterparty ${did} lookup failed: ${(err as Error).message}`,
        );
        // fail-open: skip this counterparty
      }
    }

    return undefined;
  };
}
