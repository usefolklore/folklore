/**
 * code-graph.ts — sqlite adapter for the Phase 19 structured code graph.
 *
 * Opens ~/.wellinformed/code-graph.db (separate from vectors.db per
 * 19-CONTEXT.md decisions — different lifecycle, rebuildable). Schema
 * v1 has 4 tables: codebases, code_nodes, code_edges, codebase_rooms.
 *
 * Mirrors src/infrastructure/vector-index.ts openSqliteVectorIndex
 * lazy-open pattern (ResultAsync wrapping a dynamic `better-sqlite3`
 * import so tests without sqlite-vec available still work).
 *
 * Schema versioning via PRAGMA user_version — mirrors peer-store.ts
 * PEERS_FILE_VERSION migration shape.
 *
 * CodeGraphRepository is a port (narrow capability interface). The
 * exported factory `openCodeGraph` returns the adapter bound to a
 * file path. Callers close() when done.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type Database from 'better-sqlite3';
import { CodebaseError } from '../domain/errors.js';
import type {
  Codebase,
  CodebaseId,
  CodeEdge,
  CodeNode,
  CodeNodeKind,
} from '../domain/codebase.js';

/** Current code-graph.db schema version. Bump on breaking DDL change. */
export const CODE_GRAPH_SCHEMA_VERSION = 1 as const;

// ─────────────────────── port ─────────────────────────────

export interface CodeGraphRepository {
  upsertCodebase(cb: Codebase): ResultAsync<void, CodebaseError>;
  upsertNodes(nodes: readonly CodeNode[]): ResultAsync<void, CodebaseError>;
  upsertEdges(edges: readonly CodeEdge[]): ResultAsync<void, CodebaseError>;
  attachToRoom(codebase_id: CodebaseId, room_id: string): ResultAsync<void, CodebaseError>;
  detachFromRoom(codebase_id: CodebaseId, room_id: string): ResultAsync<void, CodebaseError>;
  listCodebases(): ResultAsync<readonly Codebase[], CodebaseError>;
  getCodebase(id: CodebaseId): ResultAsync<Codebase | null, CodebaseError>;
  /** Return the stored content_hash for a file, or undefined if not indexed. */
  getFileHash(codebase_id: CodebaseId, file_path: string): ResultAsync<string | undefined, CodebaseError>;
  /** Return nodes attached to this codebase optionally filtered by kind and name LIKE pattern. */
  searchNodes(opts: {
    codebase_id?: CodebaseId;
    kind?: CodeNodeKind;
    name_pattern?: string;
    limit?: number;
  }): ResultAsync<readonly CodeNode[], CodebaseError>;
  /** Get rooms attached to a codebase. */
  getRoomsForCodebase(codebase_id: CodebaseId): ResultAsync<readonly string[], CodebaseError>;
  /** Get codebases attached to a room. */
  getCodebasesForRoom(room_id: string): ResultAsync<readonly Codebase[], CodebaseError>;
  /** Delete a codebase + all its nodes, edges, attachments (cascade). */
  deleteCodebase(id: CodebaseId): ResultAsync<void, CodebaseError>;
  close(): void;
}

// ─────────────────────── schema ───────────────────────────

const SCHEMA_V1_DDL = `
CREATE TABLE IF NOT EXISTS codebases (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  root_path        TEXT NOT NULL,
  language_summary TEXT NOT NULL,
  indexed_at       TEXT NOT NULL,
  node_count       INTEGER NOT NULL DEFAULT 0,
  root_sha         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_nodes (
  id             TEXT PRIMARY KEY,
  codebase_id    TEXT NOT NULL REFERENCES codebases(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  name           TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  start_line     INTEGER NOT NULL,
  start_col      INTEGER NOT NULL,
  end_line       INTEGER NOT NULL,
  end_col        INTEGER NOT NULL,
  parent_id      TEXT,
  language       TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  signature_json TEXT,
  extra_json     TEXT
);

CREATE INDEX IF NOT EXISTS idx_code_nodes_codebase ON code_nodes(codebase_id);
CREATE INDEX IF NOT EXISTS idx_code_nodes_file     ON code_nodes(codebase_id, file_path);
CREATE INDEX IF NOT EXISTS idx_code_nodes_name     ON code_nodes(codebase_id, name);
CREATE INDEX IF NOT EXISTS idx_code_nodes_kind     ON code_nodes(codebase_id, kind);

CREATE TABLE IF NOT EXISTS code_edges (
  id          TEXT PRIMARY KEY,
  codebase_id TEXT NOT NULL REFERENCES codebases(id) ON DELETE CASCADE,
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  confidence  TEXT,
  extra_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_code_edges_codebase ON code_edges(codebase_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_source   ON code_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_target   ON code_edges(target_id);

CREATE TABLE IF NOT EXISTS codebase_rooms (
  codebase_id TEXT NOT NULL REFERENCES codebases(id) ON DELETE CASCADE,
  room_id     TEXT NOT NULL,
  attached_at TEXT NOT NULL,
  PRIMARY KEY (codebase_id, room_id)
);
`;

// ─────────────────────── factory ──────────────────────────

export interface OpenCodeGraphOptions {
  readonly path: string;
}

export const openCodeGraph = (
  opts: OpenCodeGraphOptions,
): ResultAsync<CodeGraphRepository, CodebaseError> =>
  ResultAsync.fromPromise(
    (async () => {
      mkdirSync(dirname(opts.path), { recursive: true });

      const Better = await import('better-sqlite3');
      const DatabaseCtor = (Better as unknown as { default: typeof Database }).default;
      const db = new DatabaseCtor(opts.path);
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('foreign_keys = ON');

      const currentVersion = (db.pragma('user_version', { simple: true }) as number) ?? 0;
      if (currentVersion < CODE_GRAPH_SCHEMA_VERSION) {
        // v0 → v1 migration: create all tables and indexes
        db.exec(SCHEMA_V1_DDL);
        db.pragma(`user_version = ${CODE_GRAPH_SCHEMA_VERSION}`);
      } else if (currentVersion > CODE_GRAPH_SCHEMA_VERSION) {
        throw new Error(
          `code-graph.db schema version ${currentVersion} is newer than supported ${CODE_GRAPH_SCHEMA_VERSION}`,
        );
      }

      return build(db);
    })(),
    (e) => CodebaseError.dbOpenError(opts.path, (e as Error).message),
  );

// ─────────────────────── implementation ──────────────────

const build = (db: Database.Database): CodeGraphRepository => {
  const stUpsertCodebase = db.prepare(
    `INSERT INTO codebases(id, name, root_path, language_summary, indexed_at, node_count, root_sha)
     VALUES (@id, @name, @root_path, @language_summary, @indexed_at, @node_count, @root_sha)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       root_path = excluded.root_path,
       language_summary = excluded.language_summary,
       indexed_at = excluded.indexed_at,
       node_count = excluded.node_count,
       root_sha = excluded.root_sha`,
  );

  const stUpsertNode = db.prepare(
    `INSERT INTO code_nodes(id, codebase_id, kind, name, file_path, start_line, start_col, end_line, end_col, parent_id, language, content_hash, signature_json, extra_json)
     VALUES (@id, @codebase_id, @kind, @name, @file_path, @start_line, @start_col, @end_line, @end_col, @parent_id, @language, @content_hash, @signature_json, @extra_json)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       file_path = excluded.file_path,
       start_line = excluded.start_line,
       start_col = excluded.start_col,
       end_line = excluded.end_line,
       end_col = excluded.end_col,
       parent_id = excluded.parent_id,
       content_hash = excluded.content_hash,
       signature_json = excluded.signature_json,
       extra_json = excluded.extra_json`,
  );

  const stUpsertEdge = db.prepare(
    `INSERT INTO code_edges(id, codebase_id, source_id, target_id, kind, confidence, extra_json)
     VALUES (@id, @codebase_id, @source_id, @target_id, @kind, @confidence, @extra_json)
     ON CONFLICT(id) DO UPDATE SET
       confidence = excluded.confidence,
       extra_json = excluded.extra_json`,
  );

  const stAttach = db.prepare(
    `INSERT INTO codebase_rooms(codebase_id, room_id, attached_at)
     VALUES (?, ?, ?)
     ON CONFLICT(codebase_id, room_id) DO UPDATE SET attached_at = excluded.attached_at`,
  );

  const stDetach = db.prepare('DELETE FROM codebase_rooms WHERE codebase_id = ? AND room_id = ?');
  const stListCodebases = db.prepare('SELECT * FROM codebases ORDER BY indexed_at DESC');
  const stGetCodebase = db.prepare('SELECT * FROM codebases WHERE id = ?');
  const stGetFileHash = db.prepare(
    'SELECT content_hash FROM code_nodes WHERE codebase_id = ? AND file_path = ? LIMIT 1',
  );
  const stRoomsForCodebase = db.prepare(
    'SELECT room_id FROM codebase_rooms WHERE codebase_id = ? ORDER BY attached_at',
  );
  const stCodebasesForRoom = db.prepare(
    `SELECT c.* FROM codebases c
     INNER JOIN codebase_rooms cr ON cr.codebase_id = c.id
     WHERE cr.room_id = ?
     ORDER BY cr.attached_at`,
  );
  const stDeleteCodebase = db.prepare('DELETE FROM codebases WHERE id = ?');

  // Prepared-statement cache for searchNodes — one shape per filter combo.
  // Compose SQL at call time, then prepare-on-demand.

  const upsertCodebase = (cb: Codebase): ResultAsync<void, CodebaseError> => {
    try {
      stUpsertCodebase.run({
        id: cb.id,
        name: cb.name,
        root_path: cb.root_path,
        language_summary: cb.language_summary,
        indexed_at: cb.indexed_at,
        node_count: cb.node_count,
        root_sha: cb.root_sha,
      });
      return okAsync(undefined);
    } catch (e) {
      return errAsync(CodebaseError.dbWriteError('codebases', (e as Error).message));
    }
  };

  const upsertNodes = (nodes: readonly CodeNode[]): ResultAsync<void, CodebaseError> => {
    if (nodes.length === 0) return okAsync(undefined);
    try {
      const tx = db.transaction((batch: readonly CodeNode[]) => {
        for (const n of batch) {
          stUpsertNode.run({
            id: n.id,
            codebase_id: n.codebase_id,
            kind: n.kind,
            name: n.name,
            file_path: n.file_path,
            start_line: n.start_line,
            start_col: n.start_col,
            end_line: n.end_line,
            end_col: n.end_col,
            parent_id: n.parent_id ?? null,
            language: n.language,
            content_hash: n.content_hash,
            signature_json: n.signature_json ?? null,
            extra_json: n.extra_json ?? null,
          });
        }
      });
      tx(nodes);
      return okAsync(undefined);
    } catch (e) {
      return errAsync(CodebaseError.dbWriteError('code_nodes', (e as Error).message));
    }
  };

  const upsertEdges = (edges: readonly CodeEdge[]): ResultAsync<void, CodebaseError> => {
    if (edges.length === 0) return okAsync(undefined);
    try {
      const tx = db.transaction((batch: readonly CodeEdge[]) => {
        for (const e of batch) {
          stUpsertEdge.run({
            id: e.id,
            codebase_id: e.codebase_id,
            source_id: e.source_id,
            target_id: e.target_id,
            kind: e.kind,
            confidence: e.confidence ?? null,
            extra_json: e.extra_json ?? null,
          });
        }
      });
      tx(edges);
      return okAsync(undefined);
    } catch (err) {
      return errAsync(CodebaseError.dbWriteError('code_edges', (err as Error).message));
    }
  };

  const attachToRoom = (
    codebase_id: CodebaseId,
    room_id: string,
  ): ResultAsync<void, CodebaseError> => {
    try {
      stAttach.run(codebase_id, room_id, new Date().toISOString());
      return okAsync(undefined);
    } catch (e) {
      return errAsync(
        CodebaseError.attachFailed(codebase_id, room_id, (e as Error).message),
      );
    }
  };

  const detachFromRoom = (
    codebase_id: CodebaseId,
    room_id: string,
  ): ResultAsync<void, CodebaseError> => {
    try {
      stDetach.run(codebase_id, room_id);
      return okAsync(undefined);
    } catch (e) {
      return errAsync(CodebaseError.dbWriteError('codebase_rooms', (e as Error).message));
    }
  };

  const listCodebases = (): ResultAsync<readonly Codebase[], CodebaseError> => {
    try {
      const rows = stListCodebases.all() as Codebase[];
      return okAsync(rows);
    } catch (e) {
      return errAsync(CodebaseError.dbReadError((e as Error).message));
    }
  };

  const getCodebase = (id: CodebaseId): ResultAsync<Codebase | null, CodebaseError> => {
    try {
      const row = stGetCodebase.get(id) as Codebase | undefined;
      return okAsync(row ?? null);
    } catch (e) {
      return errAsync(CodebaseError.dbReadError((e as Error).message));
    }
  };

  const getFileHash = (
    codebase_id: CodebaseId,
    file_path: string,
  ): ResultAsync<string | undefined, CodebaseError> => {
    try {
      const row = stGetFileHash.get(codebase_id, file_path) as { content_hash: string } | undefined;
      return okAsync(row?.content_hash);
    } catch (e) {
      return errAsync(CodebaseError.dbReadError((e as Error).message));
    }
  };

  const searchNodes = (opts: {
    codebase_id?: CodebaseId;
    kind?: CodeNodeKind;
    name_pattern?: string;
    limit?: number;
  }): ResultAsync<readonly CodeNode[], CodebaseError> => {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (opts.codebase_id) {
      where.push('codebase_id = ?');
      params.push(opts.codebase_id);
    }
    if (opts.kind) {
      where.push('kind = ?');
      params.push(opts.kind);
    }
    if (opts.name_pattern) {
      where.push('name LIKE ?');
      params.push(opts.name_pattern);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
    try {
      const sql = `SELECT * FROM code_nodes ${whereSql} ORDER BY file_path, start_line LIMIT ${limit}`;
      const rows = db.prepare(sql).all(...params) as CodeNode[];
      return okAsync(rows);
    } catch (e) {
      return errAsync(CodebaseError.dbReadError((e as Error).message));
    }
  };

  const getRoomsForCodebase = (
    codebase_id: CodebaseId,
  ): ResultAsync<readonly string[], CodebaseError> => {
    try {
      const rows = stRoomsForCodebase.all(codebase_id) as Array<{ room_id: string }>;
      return okAsync(rows.map((r) => r.room_id));
    } catch (e) {
      return errAsync(CodebaseError.dbReadError((e as Error).message));
    }
  };

  const getCodebasesForRoom = (
    room_id: string,
  ): ResultAsync<readonly Codebase[], CodebaseError> => {
    try {
      const rows = stCodebasesForRoom.all(room_id) as Codebase[];
      return okAsync(rows);
    } catch (e) {
      return errAsync(CodebaseError.dbReadError((e as Error).message));
    }
  };

  const deleteCodebase = (id: CodebaseId): ResultAsync<void, CodebaseError> => {
    try {
      stDeleteCodebase.run(id);
      return okAsync(undefined);
    } catch (e) {
      return errAsync(CodebaseError.dbWriteError('codebases', (e as Error).message));
    }
  };

  const close = (): void => {
    db.close();
  };

  return {
    upsertCodebase,
    upsertNodes,
    upsertEdges,
    attachToRoom,
    detachFromRoom,
    listCodebases,
    getCodebase,
    getFileHash,
    searchNodes,
    getRoomsForCodebase,
    getCodebasesForRoom,
    deleteCodebase,
    close,
  };
};
