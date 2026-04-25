/**
 * DID extraction + utilities shared between hooks.
 * `extractDids` pulls every did:method:id occurrence out of an arbitrary
 * params object — used by before_tool_call to find counterparty agents.
 */

const DID_RE_GLOBAL = /\bdid:[a-z0-9]+:[a-zA-Z0-9._%-]+/g;
const DID_RE_FULL = /^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$/;

export function extractDids(input: unknown): string[] {
  let s: string;
  try {
    s = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    return [];
  }
  if (!s) return [];
  const found = new Set<string>();
  for (const m of s.matchAll(DID_RE_GLOBAL)) found.add(m[0]);
  return Array.from(found);
}

export function isLikelyDid(value: string | undefined | null): boolean {
  if (!value) return false;
  return DID_RE_FULL.test(value);
}
