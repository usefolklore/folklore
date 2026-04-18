/**
 * Release domain — pure version-comparison + signed-release verification.
 *
 * A release manifest published by the wellinformed project is a JSON
 * document signed under the **release-signing DID** (a long-lived
 * project Ed25519 key, distinct from any user identity). Adopters
 * pin the project DID at install time; auto-update verifies every
 * downloaded manifest matches that pinned DID.
 *
 * Manifest shape (v1):
 *   {
 *     schema:        1,
 *     version:       "3.1.0",                  // semver
 *     channel:       "stable" | "beta" | ...,
 *     released_at:   ISO-8601,
 *     tarball_url:   "https://...",
 *     tarball_sha256: "<64-hex>",
 *     min_supported_version: "3.0.0",          // optional — bumped on breaking changes
 *     notes:         "short release notes (markdown)",
 *     project_did:   "did:key:z...",
 *     signature_hex: "<128-hex Ed25519 sig over canonical-JSON of all other fields>"
 *   }
 *
 * Signature verification uses the same Ed25519 + canonical-JSON path
 * as the user-DID layer (src/domain/identity.ts), keeping the trust
 * model uniform.
 */

import { Result, err, ok } from 'neverthrow';
import {
  decodeDIDKey,
  verifyBytes,
  type DID,
  ED25519_SIGNATURE_LENGTH,
} from './identity.js';

// ─────────────────────── errors ───────────────────────────────────

export type ReleaseError =
  | { readonly type: 'ReleaseInvalidVersion';   readonly version: string; readonly message: string }
  | { readonly type: 'ReleaseInvalidManifest';  readonly field: string; readonly message: string }
  | { readonly type: 'ReleaseSignatureInvalid'; readonly message: string }
  | { readonly type: 'ReleaseDIDMismatch';      readonly expected: DID; readonly got: DID }
  | { readonly type: 'ReleaseTooOld';           readonly current: string; readonly minRequired: string };

export const ReleaseError = {
  invalidVersion:   (version: string, message: string): ReleaseError => ({ type: 'ReleaseInvalidVersion', version, message }),
  invalidManifest:  (field: string, message: string): ReleaseError => ({ type: 'ReleaseInvalidManifest', field, message }),
  signatureInvalid: (message: string): ReleaseError => ({ type: 'ReleaseSignatureInvalid', message }),
  didMismatch:      (expected: DID, got: DID): ReleaseError => ({ type: 'ReleaseDIDMismatch', expected, got }),
  tooOld:           (current: string, minRequired: string): ReleaseError => ({ type: 'ReleaseTooOld', current, minRequired }),
} as const;

// ─────────────────────── manifest shape ───────────────────────────

export interface ReleaseManifest {
  readonly schema: 1;
  readonly version: string;                  // semver "x.y.z"
  readonly channel: string;                  // 'stable' | 'beta' | etc
  readonly released_at: string;              // ISO-8601
  readonly tarball_url: string;
  readonly tarball_sha256: string;           // 64-hex
  readonly min_supported_version?: string;   // optional minimum to upgrade FROM
  readonly notes: string;
  readonly project_did: DID;
  readonly signature_hex: string;            // 128-hex Ed25519 sig
}

// ─────────────────────── semver compare ───────────────────────────

/**
 * Strict semver triplet parse. Rejects pre-release / build-metadata
 * suffixes for v1 — those land in v3.1 along with channel-aware
 * upgrade rules.
 */
const parseSemver = (s: string): Result<readonly [number, number, number], ReleaseError> => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) return err(ReleaseError.invalidVersion(s, 'expected x.y.z numeric triplet'));
  const tuple: readonly [number, number, number] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  for (let i = 0; i < 3; i++) if (!Number.isSafeInteger(tuple[i])) return err(ReleaseError.invalidVersion(s, 'numeric overflow'));
  return ok(tuple);
};

/** Returns -1 if a<b, 0 if a==b, 1 if a>b. */
export const compareSemver = (a: string, b: string): Result<number, ReleaseError> => {
  const ra = parseSemver(a);
  if (ra.isErr()) return err(ra.error);
  const rb = parseSemver(b);
  if (rb.isErr()) return err(rb.error);
  for (let i = 0; i < 3; i++) {
    if (ra.value[i] < rb.value[i]) return ok(-1);
    if (ra.value[i] > rb.value[i]) return ok(1);
  }
  return ok(0);
};

/** Convenience: true iff `proposed` is strictly newer than `current`. */
export const isNewer = (current: string, proposed: string): Result<boolean, ReleaseError> =>
  compareSemver(proposed, current).map((c) => c > 0);

// ─────────────────────── canonical JSON for signing ───────────────

/**
 * Canonical JSON for the release-signing message. Same key-sort rules
 * as src/domain/identity.ts canonicalJSON, scoped to the manifest
 * shape. Inline implementation rather than re-export keeps the release
 * trust model textually self-contained.
 */
const canonicalManifestJSON = (m: Omit<ReleaseManifest, 'signature_hex'>): string => {
  const obj: Record<string, unknown> = {
    schema: m.schema,
    version: m.version,
    channel: m.channel,
    released_at: m.released_at,
    tarball_url: m.tarball_url,
    tarball_sha256: m.tarball_sha256,
    notes: m.notes,
    project_did: m.project_did,
  };
  if (m.min_supported_version !== undefined) obj.min_supported_version = m.min_supported_version;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) parts.push(`${JSON.stringify(k)}:${JSON.stringify(obj[k])}`);
  return `{${parts.join(',')}}`;
};

// ─────────────────────── verify ───────────────────────────────────

/**
 * Verify a manifest against an EXPECTED project DID — never trust
 * the manifest's `project_did` alone; the caller must pin a known DID
 * at install time. Returns ok(manifest) if all checks pass.
 *
 * Checks (in order):
 *   1. project_did parses as did:key Ed25519
 *   2. project_did matches the expectedDID supplied by the caller
 *   3. signature_hex parses to 64 bytes
 *   4. canonical-JSON of the manifest body verifies under the project pub key
 */
export const verifyManifest = (
  manifest: ReleaseManifest,
  expectedDID: DID,
): Result<ReleaseManifest, ReleaseError> => {
  if (manifest.schema !== 1) {
    return err(ReleaseError.invalidManifest('schema', `unknown schema ${manifest.schema}`));
  }
  if (manifest.project_did !== expectedDID) {
    return err(ReleaseError.didMismatch(expectedDID, manifest.project_did));
  }
  if (!/^[0-9a-f]+$/i.test(manifest.signature_hex) || manifest.signature_hex.length !== ED25519_SIGNATURE_LENGTH * 2) {
    return err(ReleaseError.invalidManifest('signature_hex', `expected ${ED25519_SIGNATURE_LENGTH * 2} hex chars`));
  }
  if (!/^[0-9a-f]{64}$/i.test(manifest.tarball_sha256)) {
    return err(ReleaseError.invalidManifest('tarball_sha256', 'expected 64 hex chars'));
  }

  const pubKeyRes = decodeDIDKey(manifest.project_did);
  if (pubKeyRes.isErr()) {
    return err(ReleaseError.invalidManifest('project_did', `cannot decode: ${pubKeyRes.error.type}`));
  }
  const message = new TextEncoder().encode(`wellinformed-release:v1:${canonicalManifestJSON(manifest)}`);

  // Decode hex signature
  const sig = new Uint8Array(ED25519_SIGNATURE_LENGTH);
  for (let i = 0; i < ED25519_SIGNATURE_LENGTH; i++) {
    sig[i] = parseInt(manifest.signature_hex.slice(i * 2, i * 2 + 2), 16);
  }

  if (!verifyBytes(pubKeyRes.value, message, sig)) {
    return err(ReleaseError.signatureInvalid('Ed25519 verification failed under project DID'));
  }

  return ok(manifest);
};

/**
 * Composed gate: verify manifest, then check that:
 *   - proposed version is newer than current
 *   - if manifest specifies min_supported_version, current >= that
 *
 * Returns ok(manifest) iff both gates pass; otherwise the specific
 * gate failure as a typed error.
 */
export const evaluateUpgrade = (
  manifest: ReleaseManifest,
  expectedDID: DID,
  currentVersion: string,
): Result<ReleaseManifest, ReleaseError> =>
  verifyManifest(manifest, expectedDID).andThen((m) =>
    isNewer(currentVersion, m.version).andThen((newer) => {
      if (!newer) return err(ReleaseError.invalidVersion(m.version, `not newer than current ${currentVersion}`));
      if (m.min_supported_version) {
        const minCmp = compareSemver(currentVersion, m.min_supported_version);
        if (minCmp.isErr()) return err(minCmp.error);
        if (minCmp.value < 0) return err(ReleaseError.tooOld(currentVersion, m.min_supported_version));
      }
      return ok(m);
    }),
  );

// ─────────────────────── re-exports for ergonomics ────────────────

export type { DID };
