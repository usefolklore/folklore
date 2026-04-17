/**
 * Internal URI scheme registry — single source of truth for which
 * non-http/https URI prefixes wellinformed recognises as legitimate
 * opaque identifiers rather than network URLs.
 *
 * Used by:
 *   - remote-node-validator.ts — to skip URL() parse + SSRF gate on
 *     these prefixes (they aren't fetchable targets).
 *   - system-rooms.ts — to classify nodes into virtual system rooms
 *     (toolshed / research) by scheme.
 *
 * Adding a new adapter scheme? Append it here — both sides pick it up
 * automatically. Without this registry, it's too easy to ship an
 * adapter that gets silently rejected by the validator while "working"
 * locally (the bug class that produced the git: / npm: silent drops
 * the phase 35 E2E test caught).
 *
 * These schemes are OPAQUE — they don't point at network resources
 * that can be re-fetched. They're internal adapter identifiers the
 * validator should not try to URL()-parse.
 */

export const OPAQUE_INTERNAL_PREFIXES = [
  // P2P + transport-layer identifiers
  'p2p:',
  // Research-surface schemes (system room: research)
  'arxiv:',
  'hn:',
  'rss:',
  'websearch:',
  'telegram:',
  // Toolshed-surface schemes (system room: toolshed)
  'git:',
  'npm:',
  'skill:',
  'mcp-tool:',
  'repo:',
  'file-uri:',
  // Claude Code capture
  'claude-session:',
] as const;

export type OpaqueInternalPrefix = (typeof OPAQUE_INTERNAL_PREFIXES)[number];

export const isOpaqueInternalUri = (raw: string): boolean =>
  OPAQUE_INTERNAL_PREFIXES.some((p) => raw.startsWith(p));
