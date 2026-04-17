/**
 * share-picker-tty — tiny ANSI renderer + raw-stdin keybinding layer.
 *
 * All logic lives in src/domain/share-picker.ts. This file handles only
 * terminal I/O: switching stdin into raw mode, decoding key sequences,
 * rendering the picker frame with ANSI escape codes, restoring the
 * terminal on exit. Zero dependencies — stay close to the project's
 * "avoid unnecessary deps" standard.
 *
 * The list of key codes we care about is tiny — arrows, space, enter,
 * q, ctrl-c — so hand-decoding is easier than a parser lib.
 */

import type {
  PickerKey,
  PickerState,
  PickerItem,
} from '../../domain/share-picker.js';
import { computeDiff, step } from '../../domain/share-picker.js';
import { SYSTEM_ROOM_NAMES } from '../../domain/system-rooms.js';

// ─────────────────────── ANSI primitives ───────────────────

const CSI = '\u001B[';
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const CLEAR_SCREEN = `${CSI}2J${CSI}H`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;
const RESET = `${CSI}0m`;
const GREEN = `${CSI}32m`;
const CYAN = `${CSI}36m`;
const YELLOW = `${CSI}33m`;

// ─────────────────────── key decoder ───────────────────────

const decodeKey = (buf: Buffer): PickerKey | 'exit' | undefined => {
  const s = buf.toString('utf8');
  // Navigation — arrow keys and vi bindings
  if (s === `${CSI}A` || s === 'k') return { kind: 'up' };
  if (s === `${CSI}B` || s === 'j') return { kind: 'down' };
  // Toggle
  if (s === ' ')                     return { kind: 'toggle' };
  // Commit / cancel
  if (s === '\r' || s === '\n')      return { kind: 'commit' };
  if (s === '\u001B' || s === 'q')   return { kind: 'cancel' };
  // Ctrl-C — terminate process
  if (s === '\u0003')                return 'exit';
  return undefined;
};

// ─────────────────────── render ────────────────────────────

const renderRow = (item: PickerItem, selected: boolean): string => {
  const cursor = selected ? `${CYAN}❯${RESET}` : ' ';
  const check  = item.isShareable
    ? `${GREEN}[x]${RESET}`
    : `[ ]`;
  const changed = item.isShareable !== item.wasShareable ? ` ${YELLOW}(changed)${RESET}` : '';
  const count = `${DIM}${item.nodeCount} node${item.nodeCount === 1 ? '' : 's'}${RESET}`;
  return ` ${cursor} ${check} ${BOLD}${item.name}${RESET}   ${count}${changed}`;
};

const renderFrame = (state: PickerState): string => {
  const sys = [...SYSTEM_ROOM_NAMES].sort().join(' + ');
  const header = `${BOLD}wellinformed share${RESET} — toggle which physical rooms are open to peers`;
  const pinned = `${DIM}pinned system rooms: ${sys} (always shared, not shown)${RESET}`;
  const diff = computeDiff(state.items);
  const pendingBits = [
    diff.toShare.length   > 0 ? `${GREEN}+${diff.toShare.length}${RESET}`   : '',
    diff.toUnshare.length > 0 ? `${YELLOW}-${diff.toUnshare.length}${RESET}` : '',
  ].filter(Boolean).join(' ');
  const pending = pendingBits || `${DIM}no changes${RESET}`;
  const rows = state.items.length > 0
    ? state.items.map((it, i) => renderRow(it, i === state.cursor)).join('\n')
    : `${DIM}  (no physical rooms yet — run \`wellinformed trigger\` first)${RESET}`;
  const footer = `${DIM}↑/↓ (or j/k) navigate  ·  space toggle  ·  enter commit  ·  q / esc cancel${RESET}`;
  return [
    CLEAR_SCREEN,
    header,
    pinned,
    '',
    rows,
    '',
    `pending: ${pending}`,
    footer,
  ].join('\n');
};

// ─────────────────────── loop ──────────────────────────────

export interface TtyRunResult {
  readonly state: PickerState;
}

/**
 * Drive the picker against a live TTY. Returns when the user commits
 * or cancels. Non-TTY stdin (e.g., piped input, CI) throws up front —
 * the picker is interactive-only; scripting should use the imperative
 * `wellinformed share room <name>` command instead.
 */
export const runPicker = async (initial: PickerState): Promise<TtyRunResult> => {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('share ui: requires a TTY. Use `wellinformed share room <name>` in scripts.');
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(HIDE_CURSOR);

  let state = initial;
  stdout.write(renderFrame(state));

  const cleanup = (): void => {
    stdout.write(SHOW_CURSOR);
    stdout.write('\n');
    stdin.setRawMode(false);
    stdin.pause();
  };

  return new Promise<TtyRunResult>((resolve, reject) => {
    const onData = (buf: Buffer): void => {
      const key = decodeKey(buf);
      if (key === 'exit') {
        cleanup();
        reject(new Error('interrupted'));
        return;
      }
      if (!key) return;
      state = step(state, key);
      if (state.done !== false) {
        stdin.off('data', onData);
        cleanup();
        resolve({ state });
        return;
      }
      stdout.write(renderFrame(state));
    };
    stdin.on('data', onData);
  });
};
