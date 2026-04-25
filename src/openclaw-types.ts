/**
 * Vendored subset of openclaw/src/plugins/hook-types.ts and the plugin SDK
 * surface. Kept small and stable so the plugin doesn't break when upstream
 * tightens private fields. Track upstream in the close-comment of
 * openclaw/openclaw#49971 (commit 45146913007d).
 */

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface OpenClawLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ─── Hook event/context shapes (subset of upstream) ──────────────────────────

export interface BeforeInstallEvent {
  plugin?: { packageName?: string; id?: string; version?: string };
  requestedSpecifier?: string;
  mode?: "install" | "update";
  kind?: string;
}
export type BeforeInstallContext = Record<string, unknown>;
export type BeforeInstallResult =
  | undefined
  | void
  | { block?: boolean; blockReason?: string };

export interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
}
export interface BeforeToolCallContext {
  sessionKey?: string;
  channelId?: string;
  accountId?: string;
  conversationId?: string;
}
export type BeforeToolCallResult =
  | undefined
  | void
  | { block?: boolean; blockReason?: string };

export interface InboundClaimEvent {
  channel?: string;
  senderId?: string;
  metadata?: { did?: string; [k: string]: unknown };
  isGroup?: boolean;
  accountId?: string;
  isAuthorizedSender?: boolean;
  commandAuthorized?: boolean;
}
export interface InboundClaimContext {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
  senderId?: string;
}
export interface InboundClaimResult {
  handled: boolean;
  reply?: { content: string };
}

export interface GatewayStartEvent {
  port?: number;
}
export type GatewayStartContext = Record<string, unknown>;
export type GatewayStartResult = void | undefined;

// ─── Hook map ────────────────────────────────────────────────────────────────

export interface OpenClawHooks {
  before_install: (
    event: BeforeInstallEvent,
    ctx: BeforeInstallContext,
  ) => BeforeInstallResult | Promise<BeforeInstallResult>;
  before_tool_call: (
    event: BeforeToolCallEvent,
    ctx: BeforeToolCallContext,
  ) => BeforeToolCallResult | Promise<BeforeToolCallResult>;
  inbound_claim: (
    event: InboundClaimEvent,
    ctx: InboundClaimContext,
  ) => InboundClaimResult | undefined | Promise<InboundClaimResult | undefined>;
  gateway_start: (
    event: GatewayStartEvent,
    ctx: GatewayStartContext,
  ) => GatewayStartResult | Promise<GatewayStartResult>;
  gateway_stop?: () => void | Promise<void>;
}

// ─── v1 surface kept (tools, commands, services, RPC, CLI) ───────────────────

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface CommandSpec {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  handler: (
    ctx: { args?: string },
  ) => Promise<{ text: string }> | { text: string };
}

export interface ServiceSpec {
  id: string;
  start: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

export type GatewayMethodHandler = (env: {
  params?: Record<string, unknown>;
  respond: (ok: boolean, data: unknown) => void;
}) => Promise<void> | void;

export type CliRegistrar = (env: { program: unknown }) => void;

// ─── Plugin API ──────────────────────────────────────────────────────────────

export interface OpenClawPluginApi {
  pluginConfig?: unknown;
  config?: { plugins?: { entries?: Record<string, { config?: unknown }> } };
  logger: OpenClawLogger;
  on<K extends keyof OpenClawHooks>(
    hook: K,
    handler: NonNullable<OpenClawHooks[K]>,
  ): void;
  registerTool?(spec: ToolSpec): void;
  registerCommand?(spec: CommandSpec): void;
  registerService?(spec: ServiceSpec): void;
  registerGatewayMethod?(name: string, handler: GatewayMethodHandler): void;
  registerCli?(registrar: CliRegistrar, opts?: { commands?: string[] }): void;
}

// ─── Plugin config consumed at runtime ───────────────────────────────────────

export interface MolTrustConfig {
  apiKey?: string;
  apiUrl?: string;
  minTrustScore?: number;
  agentDid?: string;
  verifyOnStart?: boolean;
  sensitivePrefixes?: string[];
  gateAllTools?: boolean;
  installAllowlist?: string[];
  installBlocklist?: string[];
  cacheTtlMs?: number;
}

export const DEFAULT_CONFIG: Required<MolTrustConfig> = {
  apiKey: "",
  apiUrl: "https://api.moltrust.ch",
  minTrustScore: 0,
  agentDid: "",
  verifyOnStart: false,
  sensitivePrefixes: ["pay_", "transfer_", "x402_", "agent_call_"],
  gateAllTools: false,
  installAllowlist: [],
  installBlocklist: [],
  cacheTtlMs: 300_000,
};
