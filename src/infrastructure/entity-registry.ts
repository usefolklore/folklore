/**
 * Entity registry — persistent index of canonical entities + their
 * alias-to-id map.
 *
 * The Graph stores entity NODES (so they can have edges, be queried
 * via the existing graph traversal). The registry stores the
 * canonical user-curated metadata + the lookup index that makes
 * "lemlist" → entity:product:lemlist a constant-time hit.
 *
 * Single-writer (the daemon's job worker), multi-reader. Atomic
 * writes via tmp+rename. The registry is small (typically <1000
 * entries even for power users), so a full read+write per change
 * is fine.
 */

import { existsSync, readFileSync } from 'node:fs';
import { atomicWriteSync } from './atomic-write.js';
import {
  type Entity,
  type EntityKind,
  createEntity,
  normaliseAlias,
  touchEntity,
} from '../domain/entity.js';

interface EntityRegistryFile {
  readonly version: 1;
  readonly entities: readonly Entity[];
}

const empty = (): EntityRegistryFile => ({ version: 1, entities: [] });

const safeRead = (path: string): EntityRegistryFile => {
  if (!existsSync(path)) return empty();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as EntityRegistryFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.entities)) return empty();
    return parsed;
  } catch {
    return empty();
  }
};

const safeWrite = (path: string, file: EntityRegistryFile): void => {
  atomicWriteSync(path, JSON.stringify(file, null, 2));
};

// ─────────────── public API ───────────────

export interface EntityRegistry {
  /** Return every registered entity. */
  readonly list: () => readonly Entity[];
  /** Lookup by canonical id. */
  readonly getById: (id: string) => Entity | undefined;
  /**
   * Resolve a surface form ("Lemlist", "lemlist.com", "lemlist") to
   * the matching Entity. Case-insensitive whole-string match against
   * normalised aliases. Returns undefined if no entity claims this
   * alias.
   */
  readonly resolve: (surface: string) => Entity | undefined;
  /**
   * Register a new entity (or merge aliases into an existing one
   * when the canonical id already exists). Persists to disk.
   */
  readonly register: (input: {
    readonly label: string;
    readonly type?: EntityKind;
    readonly aliases?: readonly string[];
    readonly note?: string;
    readonly auto?: boolean;
  }) => Entity;
  /** Remove an entity by id. Idempotent — no-op when missing. */
  readonly remove: (id: string) => boolean;
  /**
   * Bump mention_count + last_seen for the given id. Persists.
   * Used by the ingest pipeline after a chunk is detected to
   * reference an entity.
   */
  readonly touch: (id: string, now?: Date) => Entity | undefined;
  /**
   * Bulk-touch — applied as a single read-modify-write so a batch
   * of N chunk mentions doesn't trigger N file writes. Returns
   * the count of entities updated.
   */
  readonly touchMany: (ids: readonly string[], now?: Date) => number;
}

export const fileEntityRegistry = (path: string): EntityRegistry => {
  const list = (): readonly Entity[] => safeRead(path).entities;

  const getById = (id: string): Entity | undefined =>
    list().find((e) => e.id === id);

  const resolve = (surface: string): Entity | undefined => {
    const norm = normaliseAlias(surface);
    return list().find((e) => e.aliases.includes(norm));
  };

  const register = (input: {
    readonly label: string;
    readonly type?: EntityKind;
    readonly aliases?: readonly string[];
    readonly note?: string;
    readonly auto?: boolean;
  }): Entity => {
    const file = safeRead(path);
    const candidate = createEntity(input);
    const existing = file.entities.find((e) => e.id === candidate.id);
    let next: Entity;
    if (existing) {
      // Merge aliases + optional note update. If the existing entry
      // is `auto:true` and the new registration is user-curated
      // (auto:false / undefined), promote it — user beats heuristic.
      const merged = new Set<string>(existing.aliases);
      for (const a of candidate.aliases) merged.add(a);
      const promoted = existing.auto && input.auto !== true ? false : existing.auto;
      next = {
        ...existing,
        label: input.label,                          // allow rename
        aliases: Array.from(merged),
        note: input.note ?? existing.note,
        auto: promoted,
      };
    } else {
      next = candidate;
    }
    const others = file.entities.filter((e) => e.id !== next.id);
    safeWrite(path, { version: 1, entities: [...others, next] });
    return next;
  };

  const remove = (id: string): boolean => {
    const file = safeRead(path);
    const before = file.entities.length;
    const next = file.entities.filter((e) => e.id !== id);
    if (next.length === before) return false;
    safeWrite(path, { version: 1, entities: next });
    return true;
  };

  const touch = (id: string, now: Date = new Date()): Entity | undefined => {
    const file = safeRead(path);
    const idx = file.entities.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    const updated = touchEntity(file.entities[idx], now);
    const next = file.entities.slice();
    next[idx] = updated;
    safeWrite(path, { version: 1, entities: next });
    return updated;
  };

  const touchMany = (ids: readonly string[], now: Date = new Date()): number => {
    if (ids.length === 0) return 0;
    const file = safeRead(path);
    const idSet = new Set(ids);
    let updated = 0;
    const next = file.entities.map((e) => {
      if (!idSet.has(e.id)) return e;
      updated++;
      return touchEntity(e, now);
    });
    if (updated === 0) return 0;
    safeWrite(path, { version: 1, entities: next });
    return updated;
  };

  return { list, getById, resolve, register, remove, touch, touchMany };
};
