/**
 * peer-labels — local registry mapping a libp2p peer-id to a
 * human-readable label (and, Phase 26, an expected GitHub handle).
 *
 * Persisted at `~/.akashik/peer-labels.json` with the shape:
 *
 *   {
 *     "version": 1,
 *     "peers": {
 *       "<peer-id>": { "github": "SaharBarak", "note": "optional" }
 *     }
 *   }
 *
 * The file is read by:
 *   - .claude/helpers/ak-statusline.cjs — renders @handle in the
 *     federation segment instead of a truncated peer-id
 *   - share-sync's inbound observer (Phase 26 stage C) — looks up the
 *     expected GitHub handle for the sending peer to pin the
 *     SignedShareableNode envelope
 *
 * The store is intentionally pull-only here: tests + the read paths use
 * `loadPeerLabels(path)` and `lookupGithub(labels, peerId)`. Operator-
 * facing CLI registration lives in `akashik peer label` (out of scope
 * for this module).
 *
 * Pure + sync — no I/O outside readFileSync + JSON.parse. Returns an
 * empty store on missing/malformed files rather than throwing, so a
 * corrupted file never bricks downstream federation.
 */

import { existsSync, readFileSync } from 'node:fs';

const VERSION = 1 as const;

export interface PeerLabelEntry {
  readonly github?: string;
  readonly note?: string;
}

export interface PeerLabelsFile {
  readonly version: typeof VERSION;
  readonly peers: Readonly<Record<string, PeerLabelEntry>>;
}

const emptyFile = (): PeerLabelsFile => ({ version: VERSION, peers: {} });

/**
 * Load peer-labels.json from `path`. Returns an empty store on missing
 * file, parse failure, or version mismatch — read paths must degrade
 * gracefully because a corrupted labels file is a UX bug, not a
 * federation-breaking one.
 */
export const loadPeerLabels = (path: string): PeerLabelsFile => {
  if (!existsSync(path)) return emptyFile();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PeerLabelsFile>;
    if (
      typeof parsed.version !== 'number' ||
      parsed.version !== VERSION ||
      !parsed.peers ||
      typeof parsed.peers !== 'object'
    ) {
      return emptyFile();
    }
    return parsed as PeerLabelsFile;
  } catch {
    return emptyFile();
  }
};

/**
 * Look up the expected GitHub handle for `peerId`. Returns undefined
 * when no entry exists OR the entry has no github field — callers
 * treat undefined as "no pinning, accept any claimed handle" so
 * federation continues to work for peers the operator hasn't labelled.
 */
export const lookupGithub = (
  labels: PeerLabelsFile,
  peerId: string,
): string | undefined => {
  const entry = labels.peers[peerId];
  return entry?.github;
};
