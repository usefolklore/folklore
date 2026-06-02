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
import { atomicWriteSync } from './atomic-write.js';

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

// ─────────────── mutators ─────────

/**
 * Upsert a peer label. Atomic write — tmp+rename so a SIGKILL
 * mid-write never leaves a half-written JSON that the next boot
 * silently rolls back to "no labels".
 *
 * Existing fields on the entry are preserved: passing only `github`
 * keeps any `note` already on the record (and vice versa). To wipe
 * an entry entirely use `removePeerLabel` instead.
 */
export const setPeerLabel = (
  path: string,
  peerId: string,
  patch: Partial<PeerLabelEntry>,
): void => {
  const current = loadPeerLabels(path);
  const existing = current.peers[peerId] ?? {};
  const merged: PeerLabelEntry = { ...existing, ...patch };
  const next: PeerLabelsFile = {
    version: 1,
    peers: { ...current.peers, [peerId]: merged },
  };
  atomicWriteSync(path, JSON.stringify(next, null, 2));
};

/**
 * Remove a peer's label record entirely. No-op when the peer wasn't
 * labelled. Atomic write same as setPeerLabel.
 */
export const removePeerLabel = (path: string, peerId: string): boolean => {
  const current = loadPeerLabels(path);
  if (!(peerId in current.peers)) return false;
  const next = { ...current.peers };
  delete next[peerId];
  const file: PeerLabelsFile = { version: 1, peers: next };
  atomicWriteSync(path, JSON.stringify(file, null, 2));
  return true;
};
