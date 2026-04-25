/**
 * before_install hook handler.
 *
 * Spec (per openclaw#49971 close-comment, src/plugins/hook-types.ts:635):
 *   - blocking semantics via {block: true, blockReason: string}
 *   - event carries plugin metadata + requestedSpecifier
 *
 * Strategy: gate by event.plugin?.packageName (or requestedSpecifier as
 * fallback) against the user-configured allowlist/blocklist. We deliberately
 * do NOT read DIDs from the filesystem here — that's too fragile for an
 * install-time decision and depends on plugin layout.
 */
import type {
  BeforeInstallContext,
  BeforeInstallEvent,
  BeforeInstallResult,
  MolTrustConfig,
  OpenClawLogger,
} from "../openclaw-types.js";

export interface BeforeInstallDeps {
  cfg: Required<MolTrustConfig>;
  logger: OpenClawLogger;
}

export function makeBeforeInstallHandler(deps: BeforeInstallDeps) {
  const { cfg, logger } = deps;

  return function beforeInstall(
    event: BeforeInstallEvent,
    _ctx: BeforeInstallContext,
  ): BeforeInstallResult {
    const pkg =
      event.plugin?.packageName ??
      event.plugin?.id ??
      event.requestedSpecifier;
    if (!pkg) return undefined;

    if (cfg.installBlocklist.includes(pkg)) {
      const reason = `[moltrust] install blocked: ${pkg} is on the install blocklist`;
      logger.warn(reason);
      return { block: true, blockReason: reason };
    }

    if (cfg.installAllowlist.length > 0 && !cfg.installAllowlist.includes(pkg)) {
      const reason = `[moltrust] install blocked: ${pkg} is not on the install allowlist`;
      logger.warn(reason);
      return { block: true, blockReason: reason };
    }

    return undefined;
  };
}
