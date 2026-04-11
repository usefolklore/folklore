/**
 * Discovery loop agent — recursive source expansion.
 *
 * Unlike `discover()` which is one-shot (match room keywords against
 * known feeds), the discovery loop:
 *
 *   1. Runs discover() for initial suggestions
 *   2. Indexes the new sources via triggerRoom
 *   3. Extracts new keywords from freshly indexed content
 *   4. Adds them to the room's keyword list
 *   5. Runs discover() again with the expanded keywords
 *   6. Repeats until no new sources found or max iterations hit
 *
 * The keyword extraction is a simple TF-IDF-like approach: split all
 * new node labels + text into words, count frequencies, keep the top
 * N that aren't already in the room's keywords or a stop-word list.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { RoomId } from '../domain/rooms.js';
import { findRoom } from '../domain/rooms.js';
import type { GraphNode } from '../domain/graph.js';
import { discover, type Suggestion } from './discover.js';
import { triggerRoom } from './ingest.js';
import type { IngestDeps } from './ingest.js';
import type { RoomsConfig } from '../infrastructure/rooms-config.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';

// ─────────────── types ──────────────────

export interface DiscoveryLoopOpts {
  readonly maxIterations?: number;
  readonly maxKeywordsPerIteration?: number;
  readonly onIteration?: (report: IterationReport) => void;
}

export interface IterationReport {
  readonly iteration: number;
  readonly new_sources: number;
  readonly new_nodes: number;
  readonly new_keywords: readonly string[];
}

export interface DiscoveryLoopReport {
  readonly room: RoomId;
  readonly iterations: readonly IterationReport[];
  readonly total_sources_added: number;
  readonly total_nodes_added: number;
  readonly final_keywords: readonly string[];
  readonly converged: boolean;
}

export interface DiscoveryLoopDeps {
  readonly ingestDeps: IngestDeps;
  readonly rooms: RoomsConfig;
  readonly sources: SourcesConfig;
}

// ─────────────── stop words ─────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'we', 'our', 'you', 'your', 'they', 'their', 'them',
  'not', 'no', 'nor', 'if', 'then', 'than', 'so', 'as', 'up', 'out',
  'about', 'into', 'over', 'after', 'before', 'between', 'under',
  'again', 'further', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'also', 'just', 'very',
  'new', 'using', 'based', 'via', 'use', 'used', 'one', 'two',
  'first', 'high', 'low', 'large', 'small', 'well', 'non', 'pre',
  'file', 'data', 'model', 'method', 'approach', 'paper', 'work',
  'results', 'show', 'propose', 'present', 'study',
  // tech generic
  'src', 'dist', 'node', 'import', 'export', 'function', 'const',
  'type', 'interface', 'class', 'return', 'async', 'await',
]);

// ─────────────── use case ───────────────

export const discoveryLoop =
  (deps: DiscoveryLoopDeps) =>
  (roomId: RoomId, opts: DiscoveryLoopOpts = {}): ResultAsync<DiscoveryLoopReport, AppError> => {
    const maxIter = opts.maxIterations ?? 3;
    const maxKw = opts.maxKeywordsPerIteration ?? 5;
    const iterations: IterationReport[] = [];
    let totalSources = 0;
    let totalNodes = 0;

    const runIteration = (
      iter: number,
    ): ResultAsync<boolean, AppError> => {
      if (iter >= maxIter) return okAsync(true); // converged by limit

      const discoverDeps = { rooms: deps.rooms, sources: deps.sources };

      return discover(discoverDeps)(roomId).andThen((suggestions) => {
        if (suggestions.length === 0) return okAsync(true); // converged naturally

        // Add the discovered sources
        return addSources(deps.sources, suggestions).andThen(() => {
          totalSources += suggestions.length;

          // Trigger to index new content
          return triggerRoom(deps.ingestDeps)(roomId).andThen((roomRun) => {
            const newNodes = roomRun.runs.reduce((s, r) => s + r.items_new, 0);
            totalNodes += newNodes;

            // Load the graph to extract new keywords
            return deps.ingestDeps.graphs
              .load()
              .mapErr((e): AppError => e)
              .andThen((graph) => {
                const roomNodes = graph.json.nodes.filter(
                  (n) => n.room === roomId,
                );
                const existingKeywords = new Set<string>();

                return deps.rooms
                  .load()
                  .mapErr((e): AppError => e)
                  .andThen((registry) => {
                    const room = findRoom(registry, roomId);
                    if (room) {
                      for (const k of room.keywords) existingKeywords.add(k.toLowerCase());
                    }

                    const newKw = extractKeywords(roomNodes, existingKeywords, maxKw);

                    const report: IterationReport = {
                      iteration: iter + 1,
                      new_sources: suggestions.length,
                      new_nodes: newNodes,
                      new_keywords: newKw,
                    };
                    iterations.push(report);
                    opts.onIteration?.(report);

                    if (newKw.length === 0) return okAsync(true); // no new keywords

                    // Update room keywords
                    return updateRoomKeywords(deps.rooms, roomId, newKw).andThen(
                      () => runIteration(iter + 1),
                    );
                  });
              });
          });
        });
      });
    };

    return runIteration(0).andThen((converged) =>
      deps.rooms
        .load()
        .mapErr((e): AppError => e)
        .map((registry): DiscoveryLoopReport => {
          const room = findRoom(registry, roomId);
          return {
            room: roomId,
            iterations,
            total_sources_added: totalSources,
            total_nodes_added: totalNodes,
            final_keywords: room ? [...room.keywords] : [],
            converged,
          };
        }),
    );
  };

// ─────────────── internals ──────────────

const addSources = (
  sources: SourcesConfig,
  suggestions: readonly Suggestion[],
): ResultAsync<void, AppError> =>
  suggestions.reduce<ResultAsync<void, AppError>>(
    (acc, s) =>
      acc.andThen(() =>
        sources.add(s.descriptor).mapErr((e): AppError => e).map(() => undefined),
      ),
    okAsync(undefined),
  );

const updateRoomKeywords = (
  rooms: RoomsConfig,
  roomId: RoomId,
  newKeywords: readonly string[],
): ResultAsync<void, AppError> =>
  rooms
    .load()
    .mapErr((e): AppError => e)
    .andThen((registry) => {
      const room = findRoom(registry, roomId);
      if (!room) return okAsync<void, AppError>(undefined);
      const updated = {
        ...registry,
        rooms: registry.rooms.map((r) =>
          r.id === roomId
            ? { ...r, keywords: [...new Set([...r.keywords, ...newKeywords])] }
            : r,
        ),
      };
      return rooms.save(updated).mapErr((e): AppError => e);
    });

/**
 * Extract candidate keywords from freshly indexed nodes.
 * Simple term-frequency approach: split labels + text into words,
 * count frequencies, filter stop words + existing keywords,
 * return top N by frequency.
 */
const extractKeywords = (
  nodes: readonly GraphNode[],
  existingKeywords: ReadonlySet<string>,
  maxKeywords: number,
): readonly string[] => {
  const freq = new Map<string, number>();

  for (const node of nodes) {
    const text = `${node.label} ${node.source_file ?? ''}`;
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && w.length <= 30);

    for (const word of words) {
      if (STOP_WORDS.has(word)) continue;
      if (existingKeywords.has(word)) continue;
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2) // appear in at least 2 nodes
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
};
