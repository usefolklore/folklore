/**
 * Secret gate — pre-transmission redaction for P2P graph exchange.
 *
 * The existing `scanNode` (sharing.ts) is a strict *detector*: it returns
 * an error and hard-blocks the node if any secret pattern matches. That's
 * the right policy for `share audit` — a user marking a room public wants
 * to be told "this node has a token in it, fix it before publishing."
 *
 * The `touch` primitive has a different posture: we've already decided to
 * transmit, and the responder cannot realistically ask the user to fix
 * their notes every time a peer pulls the graph. The gate redacts in
 * place, substituting pattern matches with `[REDACTED:<pattern-name>]`.
 *
 * Semantics:
 *   - Every string field in `SCANNABLE_FIELDS` is rewritten
 *   - Arbitrary extra string keys on the node are also rewritten
 *   - Non-string fields pass through unchanged
 *   - Returns `{ node, redactions }` — the redaction log is structural
 *     evidence for audit (how many matches, which patterns) without
 *     leaking the original secret text back to the caller
 *
 * Callers: `touch-protocol` responder, future symmetric share-sync push.
 */

import type { GraphNode } from './graph.js';
import type { buildPatterns } from './sharing.js';

export interface Redaction {
  readonly field: string;
  readonly pattern_name: string;
  readonly count: number;
}

export interface RedactedNode {
  readonly node: GraphNode;
  readonly redactions: readonly Redaction[];
}

type PatternSet = ReturnType<typeof buildPatterns>;

const redactString = (
  value: string,
  field: string,
  patterns: PatternSet,
): { readonly value: string; readonly redactions: readonly Redaction[] } => {
  const redactions: Redaction[] = [];
  const next = patterns.reduce<string>((acc, { name, re }) => {
    re.lastIndex = 0;
    let count = 0;
    const replaced = acc.replace(re, () => {
      count++;
      return `[REDACTED:${name}]`;
    });
    if (count > 0) redactions.push({ field, pattern_name: name, count });
    return replaced;
  }, value);
  return { value: next, redactions };
};

/**
 * Redact every string field on a GraphNode against the pattern set.
 * Returns a new node (structural-sharing not attempted — graphs are small
 * enough that the copy cost is negligible).
 */
export const redactNode = (
  node: GraphNode,
  patterns: PatternSet,
): RedactedNode => {
  const entries = Object.entries(node) as ReadonlyArray<readonly [string, unknown]>;
  const accRedactions: Redaction[] = [];
  const nextEntries = entries.map(([key, value]) => {
    if (typeof value !== 'string') return [key, value] as const;
    const { value: clean, redactions } = redactString(value, key, patterns);
    accRedactions.push(...redactions);
    return [key, clean] as const;
  });
  return {
    node: Object.fromEntries(nextEntries) as GraphNode,
    redactions: accRedactions,
  };
};

/**
 * Redact a list of nodes. Returns the cleaned list plus the aggregate
 * redaction log keyed by node id — useful for the `touch` responder's
 * audit trail.
 */
export const redactNodes = (
  nodes: readonly GraphNode[],
  patterns: PatternSet,
): {
  readonly nodes: readonly GraphNode[];
  readonly redactions_by_node: ReadonlyMap<string, readonly Redaction[]>;
} => {
  const redactionsByNode = new Map<string, readonly Redaction[]>();
  const cleaned = nodes.map((n) => {
    const { node, redactions } = redactNode(n, patterns);
    if (redactions.length > 0) redactionsByNode.set(n.id, redactions);
    return node;
  });
  return { nodes: cleaned, redactions_by_node: redactionsByNode };
};
