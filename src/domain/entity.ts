/**
 * Entity domain model — the object layer of the knowledge graph.
 *
 * Wellinformed's chunk graph (documents → text → embeddings) is a
 * *document* index. The entity layer makes it a *knowledge graph*:
 * concrete objects (products, repos, people, concepts) become nodes
 * the system can reason over independently of which document
 * happened to mention them.
 *
 * When the user says "lemlist", the system should be able to
 * answer "I have N mentions across the research room (a tutorial
 * I read), the sessions room (a conversation 3 days ago), and the
 * toolshed (a comment in the codebase)" without semantic-text
 * matching alone — the entity itself is a first-class node.
 *
 * Storage:
 *   - Entity nodes live in the same Graph (kind: 'entity').
 *   - User-registered aliases live in entities.json (registry —
 *     source of truth for canonical-form-to-id mapping).
 *   - `mentions` edges connect chunk nodes to entity nodes.
 *
 * v1 is intentionally simple: no NER model, no embedding-based
 * coreference. Heuristic + user-registered extraction is enough
 * to demonstrate the shape and unblock the recall UX.
 */

/**
 * Coarse kind taxonomy. Helps disambiguation ("lemlist" the
 * product vs "Lemlist" the company), helps the recall renderer
 * pick the right UI affordances per kind.
 */
export type EntityKind =
  | 'product'      // SaaS / library / service: lemlist, sqlite-vec
  | 'org'          // company / team: Anthropic, libp2p
  | 'person'       // human: alice@example.com
  | 'repo'         // github.com/owner/repo
  | 'package'      // npm / pypi: @noble/hashes
  | 'concept'      // RAG, hybrid retrieval, NDCG@10
  | 'symbol'       // code identifier: indexChunksFor, runIngestBatch
  | 'url'          // canonicalised host: lemlist.com
  | 'unknown';

export interface Entity {
  /** Canonical id: 'entity:<kind>:<slug>' — stable across renames of label. */
  readonly id: string;
  /** Always 'entity' — discriminates from chunk / source nodes in the Graph. */
  readonly kind: 'entity';
  /** Display name. Editable by the user. */
  readonly label: string;
  readonly type: EntityKind;
  /**
   * All surface forms that map to this entity. Lowercased,
   * whitespace-trimmed. Lookup is case-insensitive whole-word
   * match against this set.
   */
  readonly aliases: readonly string[];
  readonly first_seen: string;       // ISO-8601
  readonly last_seen: string;        // ISO-8601 — updated on every mention
  readonly mention_count: number;    // monotonic
  /** Optional human note shown in `wellinformed entity list`. */
  readonly note?: string;
  /**
   * True when the entity was added by heuristic auto-detection
   * (CamelCase identifier, URL host, GitHub repo) rather than by
   * an explicit user `entity add`. Hidden from `entity list` by
   * default; surfaced via `--all`. Recall still finds them.
   */
  readonly auto?: boolean;
}

/** A detected mention of an entity inside a chunk's text. */
export interface Mention {
  readonly entity_id: string;
  readonly surface: string;          // exact substring as it appeared
  readonly start: number;            // char offset within chunk text
  readonly end: number;              // exclusive
}

// ─────────────── id helpers ───────────────

/** Lowercase + collapse whitespace + strip URL noise. */
export const normaliseAlias = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Slug for the canonical id. Only alphanumeric + hyphen.
 * Idempotent: slugify(slugify(x)) === slugify(x).
 */
export const slugifyEntity = (label: string): string =>
  normaliseAlias(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

export const entityId = (type: EntityKind, label: string): string =>
  `entity:${type}:${slugifyEntity(label)}`;

// ─────────────── construction ─────────────

export interface CreateEntityInput {
  readonly label: string;
  readonly type?: EntityKind;          // default 'unknown'
  readonly aliases?: readonly string[]; // additional aliases beyond the label
  readonly note?: string;
  readonly auto?: boolean;             // marker for heuristic-detected
}

export const createEntity = (
  input: CreateEntityInput,
  now: Date = new Date(),
): Entity => {
  const type: EntityKind = input.type ?? 'unknown';
  const id = entityId(type, input.label);
  // Aliases always include the normalised label.
  const aliasSet = new Set<string>([normaliseAlias(input.label)]);
  for (const a of input.aliases ?? []) aliasSet.add(normaliseAlias(a));
  return {
    id,
    kind: 'entity',
    label: input.label,
    type,
    aliases: Array.from(aliasSet),
    first_seen: now.toISOString(),
    last_seen: now.toISOString(),
    mention_count: 0,
    note: input.note,
    auto: input.auto,
  };
};

/**
 * Increment mention_count by `times` (default 1) and advance last_seen.
 * Pure. The `times` parameter exists so a single batch that mentions
 * an entity ten times can post one update with +10 instead of either
 * (a) writing the registry ten times or (b) under-counting via
 * `Set`-based dedupe (gemini synthesis HIGH on entity-registry.ts:153).
 */
export const touchEntity = (e: Entity, now: Date = new Date(), times = 1): Entity => ({
  ...e,
  mention_count: e.mention_count + Math.max(0, times),
  last_seen: now.toISOString(),
});

/** Type guard — does this graph node represent an Entity? */
export const isEntityNode = (n: { readonly kind?: unknown }): boolean =>
  n.kind === 'entity';
