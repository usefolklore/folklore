/**
 * BIP39 mnemonic recovery — Phase 4.1 v4.1 helper that converts the
 * 32-byte Ed25519 user seed to/from a 24-word English mnemonic.
 *
 * Why BIP39:
 *   - Universally recognized format (Bitcoin, Ethereum, Nostr,
 *     keystore standards). Operators recognize the 24-word shape and
 *     trust the recovery story.
 *   - Hex remains supported for backward compatibility with v4.0;
 *     `wellinformed identity import` autodetects the format.
 *   - 24-word phrase = 256 bits of entropy = exact match for the
 *     Ed25519 seed length. No HKDF derivation needed.
 *
 * Pure — neverthrow Result. The cryptographic backbone lives in
 * `@scure/bip39` (40 KB audited dep, used by every Bitcoin/ETH wallet).
 */

import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic as bip39Validate } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Result, err, ok } from 'neverthrow';
import { IdentityError } from '../domain/errors.js';

/**
 * Convert a 32-byte Ed25519 seed to a 24-word English BIP39 mnemonic.
 * 24 words = 256 bits = exact seed length, no derivation needed.
 */
export const mnemonicFromSeed = (seed: Uint8Array): Result<string, IdentityError> => {
  if (seed.length !== 32) {
    return err(IdentityError.keyGeneration(`mnemonicFromSeed: expected 32-byte seed, got ${seed.length}`));
  }
  try {
    return ok(entropyToMnemonic(seed, wordlist));
  } catch (e) {
    return err(IdentityError.keyGeneration(`mnemonic encode failed: ${(e as Error).message}`));
  }
};

/**
 * Convert a 24-word English BIP39 mnemonic back to the 32-byte seed.
 * Validates the checksum word — invalid mnemonics return InvalidDID.
 */
export const seedFromMnemonic = (mnemonic: string): Result<Uint8Array, IdentityError> => {
  const trimmed = mnemonic.trim().split(/\s+/).join(' ');
  const wordCount = trimmed.split(' ').length;
  if (wordCount !== 24) {
    return err(IdentityError.invalidDID(
      '(mnemonic)',
      `BIP39 mnemonic must be exactly 24 words (got ${wordCount})`,
    ));
  }
  try {
    if (!bip39Validate(trimmed, wordlist)) {
      return err(IdentityError.invalidDID('(mnemonic)', 'BIP39 checksum validation failed'));
    }
    const entropy = mnemonicToEntropy(trimmed, wordlist);
    if (entropy.length !== 32) {
      return err(IdentityError.invalidDID('(mnemonic)', `BIP39 entropy length ${entropy.length} != 32`));
    }
    return ok(new Uint8Array(entropy));
  } catch (e) {
    return err(IdentityError.invalidDID('(mnemonic)', `mnemonic decode failed: ${(e as Error).message}`));
  }
};

/** Convenience predicate: valid 24-word BIP39 mnemonic? */
export const validateMnemonic = (mnemonic: string): boolean => {
  const trimmed = mnemonic.trim().split(/\s+/).join(' ');
  if (trimmed.split(' ').length !== 24) return false;
  try { return bip39Validate(trimmed, wordlist); }
  catch { return false; }
};
