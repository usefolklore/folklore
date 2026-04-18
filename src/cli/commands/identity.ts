/**
 * `wellinformed identity <sub>` — inspect and manage the user+device
 * identity tuple that wraps every outbound memory entry (DID wave).
 *
 * Subcommands:
 *   init                — create identity if absent (idempotent)
 *   show                — print DID, device id, authorization timestamp
 *   rotate              — rotate the device key under the existing user DID
 *   export              — emit the 32-byte recovery hex (SENSITIVE — warns)
 *   import <hex>        — restore from recovery hex, regenerates device
 *
 * All I/O goes through the identity-lifecycle application layer. The
 * CLI's only job is arg parsing, pretty-printing, and exit codes.
 */

import { formatError } from '../../domain/errors.js';
import {
  ensureIdentity,
  rotateDeviceKey,
  exportRecoveryHex,
  exportRecoveryMnemonic,
  importRecoveryAuto,
} from '../../application/identity-lifecycle.js';
import { wellinformedHome } from '../runtime.js';

const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

const printResolved = (title: string, r: { user: { did: string; publicKey: Uint8Array; created_at: string }; deviceKey: { device_id: string; authorized_at: string; device_public_key: Uint8Array } }): void => {
  console.log(title);
  console.log(`  user DID:         ${r.user.did}`);
  console.log(`  public key:       0x${toHex(r.user.publicKey)}`);
  console.log(`  created_at:       ${r.user.created_at}`);
  console.log(`  device id:        ${r.deviceKey.device_id}`);
  console.log(`  device pub:       0x${toHex(r.deviceKey.device_public_key)}`);
  console.log(`  authorized_at:    ${r.deviceKey.authorized_at}`);
};

const init = async (): Promise<number> => {
  const res = await ensureIdentity(wellinformedHome());
  if (res.isErr()) {
    console.error(`identity init: ${formatError(res.error)}`);
    return 1;
  }
  printResolved('identity ready:', res.value);
  return 0;
};

const show = async (): Promise<number> => {
  // `ensureIdentity` doubles as a load-or-initialize. We could also
  // add a load-only variant to the application layer — for now, show
  // implies "create if missing" which matches operator expectations.
  const res = await ensureIdentity(wellinformedHome());
  if (res.isErr()) {
    console.error(`identity show: ${formatError(res.error)}`);
    return 1;
  }
  printResolved('identity:', res.value);
  return 0;
};

const rotate = async (): Promise<number> => {
  const res = await rotateDeviceKey(wellinformedHome());
  if (res.isErr()) {
    console.error(`identity rotate: ${formatError(res.error)}`);
    return 1;
  }
  printResolved('device key rotated:', res.value);
  return 0;
};

const exportCmd = async (rest: readonly string[]): Promise<number> => {
  const wantHex = rest.includes('--hex');
  const res = wantHex
    ? await exportRecoveryHex(wellinformedHome())
    : await exportRecoveryMnemonic(wellinformedHome());
  if (res.isErr()) {
    console.error(`identity export: ${formatError(res.error)}`);
    return 1;
  }
  console.error('⚠  SENSITIVE — anyone holding this string can impersonate your user DID.');
  console.error('   Store it somewhere only you can access (password manager, cold storage).');
  if (wantHex) {
    console.error('   v1 hex format: 64-char hex of the 32-byte Ed25519 seed.\n');
  } else {
    console.error('   v4.1 BIP39 format: 24 English words = 256 bits = exact seed.');
    console.error('   Use `wellinformed identity export --hex` for the legacy v1 hex format.\n');
  }
  console.log(res.value);
  return 0;
};

const importCmd = async (rest: readonly string[]): Promise<number> => {
  // The recovery argument may be:
  //   - a 24-word BIP39 mnemonic (v4.1 default)
  //   - a 64-char hex seed (v4.0 legacy)
  // Autodetect via importRecoveryAuto. Multi-word mnemonics arrive as
  // multiple argv tokens; join them.
  if (rest.length === 0) {
    console.error('identity import: missing recovery input.');
    console.error('  usage: wellinformed identity import <24-word-mnemonic>');
    console.error('         wellinformed identity import <64-char-hex>');
    return 1;
  }
  const input = rest.join(' ');
  const res = await importRecoveryAuto(wellinformedHome(), input);
  if (res.isErr()) {
    console.error(`identity import: ${formatError(res.error)}`);
    return 1;
  }
  printResolved('identity restored:', res.value);
  return 0;
};

const help = (): number => {
  console.log('usage: wellinformed identity <sub>');
  console.log('');
  console.log('  init                          create user+device identity if missing (idempotent)');
  console.log('  show                          print current identity');
  console.log('  rotate                        rotate the device key');
  console.log('  export [--hex]                print recovery — 24-word BIP39 mnemonic by default,');
  console.log('                                hex with --hex (SENSITIVE — warns)');
  console.log('  import <words... | hex>       restore identity from BIP39 mnemonic OR 64-char hex');
  console.log('');
  console.log('Every memory entry wellinformed signs is wrapped in an envelope');
  console.log('provably authored by this user DID via this device key. Rotating');
  console.log('the device key revokes it for future signatures; past envelopes');
  console.log('remain verifiable because each embeds its own device pubkey.');
  return 0;
};

export const identity = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'init':
      return init();
    case 'show':
    case undefined:
      return show();
    case 'rotate':
      return rotate();
    case 'export':
      return exportCmd(rest);
    case 'import':
      return importCmd(rest);
    case 'help':
    case '--help':
    case '-h':
      return help();
    default:
      console.error(`identity: unknown subcommand '${sub}'`);
      help();
      return 1;
  }
};
