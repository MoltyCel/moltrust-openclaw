import { describe, expect, it, vi } from "vitest";
import { makeBeforeInstallHandler } from "../src/hooks/before-install.js";
import { DEFAULT_CONFIG } from "../src/openclaw-types.js";

const stubLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("before_install", () => {
  it("passes when allowlist empty and package not on blocklist", () => {
    const h = makeBeforeInstallHandler({
      cfg: { ...DEFAULT_CONFIG },
      logger: stubLogger(),
    });
    const r = h({ plugin: { packageName: "@x/y" } }, {});
    expect(r).toBeUndefined();
  });

  it("blocks if package is on blocklist", () => {
    const h = makeBeforeInstallHandler({
      cfg: { ...DEFAULT_CONFIG, installBlocklist: ["@evil/pkg"] },
      logger: stubLogger(),
    });
    const r = h({ plugin: { packageName: "@evil/pkg" } }, {}) as
      | { block?: boolean; blockReason?: string }
      | undefined;
    expect(r?.block).toBe(true);
    expect(r?.blockReason).toContain("blocklist");
  });

  it("blocks if allowlist set and package not on it", () => {
    const h = makeBeforeInstallHandler({
      cfg: { ...DEFAULT_CONFIG, installAllowlist: ["@trusted/pkg"] },
      logger: stubLogger(),
    });
    const r = h({ plugin: { packageName: "@x/y" } }, {}) as
      | { block?: boolean; blockReason?: string }
      | undefined;
    expect(r?.block).toBe(true);
    expect(r?.blockReason).toContain("allowlist");
  });

  it("passes when package is on allowlist", () => {
    const h = makeBeforeInstallHandler({
      cfg: { ...DEFAULT_CONFIG, installAllowlist: ["@trusted/pkg"] },
      logger: stubLogger(),
    });
    const r = h({ plugin: { packageName: "@trusted/pkg" } }, {});
    expect(r).toBeUndefined();
  });

  it("falls back to requestedSpecifier when plugin.packageName missing", () => {
    const h = makeBeforeInstallHandler({
      cfg: { ...DEFAULT_CONFIG, installBlocklist: ["@evil/pkg"] },
      logger: stubLogger(),
    });
    const r = h({ requestedSpecifier: "@evil/pkg" }, {}) as
      | { block?: boolean }
      | undefined;
    expect(r?.block).toBe(true);
  });
});
