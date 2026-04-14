/**
 * Rust retrieval client — thin stdio JSON-RPC wrapper around the
 * wellinformed-rs `embed_server` binary for the non-embedder ops:
 * tunnel detection (Phase 27, mathematician Proposal B — RNG graph)
 * and pilot-centroid room routing (Phase 28, RouterRetriever-style).
 *
 * Shape mirrors `rustSubprocessEmbedder` from `embedders.ts`: a single
 * long-lived subprocess, single-flight FIFO request queue, lazy
 * startup on first use, graceful error propagation via neverthrow
 * Result monads. Every call is pure wrt the client's observable
 * state: same input → same output (the Rust side is stateless).
 *
 * Strategy pattern: the `RustRetrievalClient` interface is what the
 * application layer should depend on; the concrete `spawnRustRetrievalClient`
 * factory is infrastructure-only.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { VectorError } from '../domain/errors.js';
import type { NodeId, Room } from '../domain/graph.js';
import type { Vector } from '../domain/vectors.js';

// ─────────────────────── wire types ───────────────────────

interface WireVector {
  readonly node_id: NodeId;
  readonly room: Room;
  readonly vector: readonly number[];
}

interface WireTunnel {
  readonly a: NodeId;
  readonly b: NodeId;
  readonly room_a: Room;
  readonly room_b: Room;
  readonly distance: number;
}

interface WireCentroid {
  readonly room: Room;
  readonly vector: readonly number[];
  readonly doc_count: number;
}

interface RustRequest {
  readonly op: 'find_tunnels' | 'compute_centroids' | 'ping' | 'shutdown';
  readonly vectors?: readonly WireVector[];
  readonly k_neighbors?: number;
}

interface RustResponse {
  readonly ok: boolean;
  readonly tunnels?: readonly WireTunnel[];
  readonly centroids?: readonly WireCentroid[];
  readonly error?: string;
  readonly version?: string;
}

// ─────────────────────── domain-layer outputs ─────────────

/**
 * Tunnel in wellinformed's domain shape — a semantic bridge between
 * two rooms, returned by the RNG graph pass. Distance is L2 between
 * the two nodes' embeddings.
 */
export interface RetrievalTunnel {
  readonly a: NodeId;
  readonly b: NodeId;
  readonly room_a: Room;
  readonly room_b: Room;
  readonly distance: number;
}

/**
 * A room's L2-normalized pilot centroid vector, used for
 * RouterRetriever-style routing (cosine query → nearest room).
 */
export interface RoomCentroid {
  readonly room: Room;
  readonly vector: Vector;
  readonly doc_count: number;
}

/**
 * Port — the application layer depends on this interface, not on
 * the concrete subprocess implementation. Lets unit tests swap in a
 * pure in-memory fake.
 */
export interface RustRetrievalClient {
  findTunnels(
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
    kNeighbors?: number,
  ): ResultAsync<readonly RetrievalTunnel[], VectorError>;

  computeCentroids(
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
  ): ResultAsync<readonly RoomCentroid[], VectorError>;

  close(): void;
}

// ─────────────────────── options ─────────────────────────

export interface RustRetrievalOptions {
  /**
   * Path to the embed_server binary. Defaults to the repo-local
   * `wellinformed-rs/target/release/embed_server`; override via
   * `$WELLINFORMED_RUST_BIN` env var or this option.
   */
  readonly binaryPath?: string;
}

// ─────────────────────── adapter ─────────────────────────

const defaultBinaryPath = (): string => {
  const envBin = process.env.WELLINFORMED_RUST_BIN;
  if (envBin) return envBin;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'wellinformed-rs', 'target', 'release', 'embed_server');
};

/**
 * Spawn a long-lived Rust retrieval client. Lazy — no subprocess
 * until the first op is called.
 */
export const spawnRustRetrievalClient = (
  opts: RustRetrievalOptions = {},
): RustRetrievalClient => {
  const binaryPath = opts.binaryPath ?? defaultBinaryPath();

  let child: ChildProcessWithoutNullStreams | null = null;
  const pending: Array<(res: RustResponse) => void> = [];
  let initPromise: Promise<void> | null = null;

  const ensureStarted = (): ResultAsync<void, VectorError> => {
    if (child && !child.killed) return okAsync(undefined);
    if (!initPromise) {
      initPromise = new Promise<void>((resolve, reject) => {
        try {
          const spawned = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
          spawned.on('error', (e) => reject(e));
          spawned.on('exit', (code) => {
            child = null;
            while (pending.length > 0) {
              const resolver = pending.shift();
              if (resolver) {
                resolver({
                  ok: false,
                  error: `embed_server exited with code ${code}`,
                });
              }
            }
          });
          spawned.stderr.setEncoding('utf8');
          spawned.stderr.on('data', () => {
            // startup banner + goodbye — absorb silently
          });

          readline.createInterface({ input: spawned.stdout }).on('line', (line) => {
            const resolver = pending.shift();
            if (!resolver) return;
            try {
              resolver(JSON.parse(line) as RustResponse);
            } catch (e) {
              resolver({
                ok: false,
                error: `stdout parse: ${(e as Error).message}`,
              });
            }
          });

          child = spawned;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }
    return ResultAsync.fromPromise(initPromise, (e) =>
      VectorError.readError(`rust retrieval spawn: ${(e as Error).message}`),
    );
  };

  const sendRequest = (req: RustRequest): ResultAsync<RustResponse, VectorError> =>
    ensureStarted().andThen(() =>
      ResultAsync.fromPromise(
        new Promise<RustResponse>((resolve) => {
          pending.push(resolve);
          child?.stdin.write(`${JSON.stringify(req)}\n`);
        }),
        (e) => VectorError.readError(`rust retrieval send: ${(e as Error).message}`),
      ).andThen((resp) =>
        resp.ok
          ? okAsync<RustResponse, VectorError>(resp)
          : errAsync<RustResponse, VectorError>(
              VectorError.readError(resp.error ?? 'rust retrieval returned ok:false'),
            ),
      ),
    );

  const toWireVectors = (
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
  ): readonly WireVector[] =>
    vectors.map((v) => ({
      node_id: v.node_id,
      room: v.room,
      vector: Array.from(v.vector),
    }));

  const findTunnels = (
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
    kNeighbors = 20,
  ): ResultAsync<readonly RetrievalTunnel[], VectorError> =>
    sendRequest({
      op: 'find_tunnels',
      vectors: toWireVectors(vectors),
      k_neighbors: kNeighbors,
    }).andThen((resp) => {
      const tunnels = resp.tunnels;
      if (!tunnels) {
        return errAsync<readonly RetrievalTunnel[], VectorError>(
          VectorError.readError('rust retrieval: no tunnels in response'),
        );
      }
      return okAsync<readonly RetrievalTunnel[], VectorError>(
        tunnels.map((t) => ({
          a: t.a,
          b: t.b,
          room_a: t.room_a,
          room_b: t.room_b,
          distance: t.distance,
        })),
      );
    });

  const computeCentroids = (
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
  ): ResultAsync<readonly RoomCentroid[], VectorError> =>
    sendRequest({
      op: 'compute_centroids',
      vectors: toWireVectors(vectors),
    }).andThen((resp) => {
      const centroids = resp.centroids;
      if (!centroids) {
        return errAsync<readonly RoomCentroid[], VectorError>(
          VectorError.readError('rust retrieval: no centroids in response'),
        );
      }
      return okAsync<readonly RoomCentroid[], VectorError>(
        centroids.map((c) => ({
          room: c.room,
          vector: new Float32Array(c.vector),
          doc_count: c.doc_count,
        })),
      );
    });

  const close = (): void => {
    if (child && !child.killed) {
      child.stdin.write(`${JSON.stringify({ op: 'shutdown' })}\n`);
      child.stdin.end();
    }
    child = null;
  };

  return { findTunnels, computeCentroids, close };
};
