/**
 * `wellinformed logs <sub>` — local-first network telemetry surface.
 *
 *   tail [n]                  print last n events from today (default 50)
 *   export <path>             write a gzipped NDJSON bundle of all logs
 *   enable-shipping <url>     POST new events to <url> (NDJSON batches)
 *   disable-shipping          stop POSTing
 *   status                    show shipping config + offset
 *   rotate                    compress yesterday + delete > retention
 *
 * Logs live under ~/.wellinformed/logs/. Shipping is opt-in; default is
 * local-only, no telemetry leaves the machine without an explicit
 * `enable-shipping` call (matches the P2P-first ethos).
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { fmtEvent } from '../../domain/log-event.js';
import {
  logPaths,
  tailToday,
  exportBundle,
  enableShipping,
  disableShipping,
  getShippingStatus,
  rotate,
} from '../../infrastructure/log-store.js';
import { wellinformedHome } from '../runtime.js';

const tail = async (rest: readonly string[]): Promise<number> => {
  const n = rest[0] ? parseInt(rest[0], 10) : 50;
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`logs tail: bad count '${rest[0]}'`);
    return 1;
  }
  const r = await tailToday(logPaths(wellinformedHome()), n);
  if (r.isErr()) {
    console.error(`logs tail: ${formatError(r.error)}`);
    return 1;
  }
  if (r.value.length === 0) {
    console.log('(no events today)');
    return 0;
  }
  for (const e of r.value) console.log(fmtEvent(e));
  return 0;
};

const exportCmd = async (rest: readonly string[]): Promise<number> => {
  const target = rest[0];
  if (!target) {
    console.error('logs export: missing <path>. usage: wellinformed logs export ./welly-debug.ndjson.gz');
    return 1;
  }
  const r = await exportBundle(logPaths(wellinformedHome()));
  if (r.isErr()) {
    console.error(`logs export: ${formatError(r.error)}`);
    return 1;
  }
  const abs = resolve(target);
  writeFileSync(abs, r.value);
  console.log(`✓ wrote ${r.value.length.toLocaleString()} bytes to ${abs}`);
  console.log('  decompress: gunzip -c FILE | head');
  return 0;
};

const enableCmd = async (rest: readonly string[]): Promise<number> => {
  const url = rest[0];
  if (!url) {
    console.error('logs enable-shipping: missing <url>. usage: wellinformed logs enable-shipping https://logs.example.com/ingest');
    return 1;
  }
  if (!/^https?:\/\//.test(url)) {
    console.error(`logs enable-shipping: '${url}' must be http(s)://...`);
    return 1;
  }
  const r = await enableShipping(logPaths(wellinformedHome()), url);
  if (r.isErr()) {
    console.error(`logs enable-shipping: ${formatError(r.error)}`);
    return 1;
  }
  console.log(`✓ shipping enabled → ${url}`);
  console.log('  events POST as application/x-ndjson; daemon ships every tick.');
  console.log('  disable any time:  wellinformed logs disable-shipping');
  return 0;
};

const disableCmd = async (): Promise<number> => {
  const r = await disableShipping(logPaths(wellinformedHome()));
  if (r.isErr()) {
    console.error(`logs disable-shipping: ${formatError(r.error)}`);
    return 1;
  }
  console.log('✓ shipping disabled (config retained — re-enable any time)');
  return 0;
};

const status = async (): Promise<number> => {
  const r = await getShippingStatus(logPaths(wellinformedHome()));
  if (r.isErr()) {
    console.error(`logs status: ${formatError(r.error)}`);
    return 1;
  }
  if (!r.value) {
    console.log('shipping:    not configured (logs are local-only)');
  } else {
    console.log(`shipping:    ${r.value.enabled ? 'enabled' : 'disabled'}`);
    console.log(`endpoint:    ${r.value.endpoint}`);
    console.log(`offset:      ${r.value.last_shipped_offset.toLocaleString()} bytes`);
    console.log(`last sent:   ${r.value.last_shipped_at ?? '(never)'}`);
  }
  return 0;
};

const rotateCmd = async (): Promise<number> => {
  const r = await rotate(logPaths(wellinformedHome()));
  if (r.isErr()) {
    console.error(`logs rotate: ${formatError(r.error)}`);
    return 1;
  }
  console.log(`✓ compressed=${r.value.compressed} deleted=${r.value.deleted}`);
  return 0;
};

const help = (): number => {
  console.log('usage: wellinformed logs <sub>');
  console.log('');
  console.log('  tail [n]                 print last n events (default 50)');
  console.log('  export <path>            write gzipped NDJSON bundle of all logs');
  console.log('  enable-shipping <url>    POST new events to <url>');
  console.log('  disable-shipping         stop POSTing');
  console.log('  status                   show shipping config + offset');
  console.log('  rotate                   compress yesterday + delete > 30d');
  console.log('');
  console.log('Logs are local-first (~/.wellinformed/logs/). Shipping is opt-in; nothing');
  console.log('leaves the machine until enable-shipping is explicitly called. Free-form');
  console.log('text fields are truncated + secret-scanned at the infrastructure boundary.');
  console.log('User DIDs are SHA-256(did||day) hashed before logging — daily-rotating tag.');
  return 0;
};

export const logs = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'tail':              return tail(rest);
    case 'export':            return exportCmd(rest);
    case 'enable-shipping':   return enableCmd(rest);
    case 'disable-shipping':  return disableCmd();
    case 'status':
    case undefined:           return status();
    case 'rotate':            return rotateCmd();
    case 'help':
    case '--help':
    case '-h':                return help();
    default:
      console.error(`logs: unknown subcommand '${sub}'`);
      help();
      return 1;
  }
};
