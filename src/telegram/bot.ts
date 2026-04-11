/**
 * Telegram bot — long-polling client for wellinformed.
 *
 * Single-user, runs inside the daemon process. Handles:
 *   - Inbound URLs → auto-ingest into best-matching room
 *   - Inbound text → save as note or route as command
 *   - Outbound digests → daily summary after daemon tick
 *   - Commands → ask, report, trigger, status, rooms
 */

import TelegramBot from 'node-telegram-bot-api';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';
import { handleCapture } from './capture.js';
import { handleCommand } from './commands.js';
import type { Runtime } from '../cli/runtime.js';

export interface TelegramConfig {
  readonly bot_token: string;
  readonly chat_id: string;
  readonly enabled: boolean;
}

export const loadTelegramConfig = (raw: Record<string, unknown>): TelegramConfig | null => {
  const tg = (raw.telegram ?? {}) as Record<string, unknown>;
  const token = typeof tg.bot_token === 'string' ? tg.bot_token : process.env.TELEGRAM_BOT_TOKEN;
  const chatId = typeof tg.chat_id === 'string' ? tg.chat_id : process.env.TELEGRAM_CHAT_ID;
  const enabled = tg.enabled !== false;
  if (!token || !chatId) return null;
  return { bot_token: token, chat_id: chatId, enabled };
};

export interface WellinformedBot {
  readonly sendMessage: (text: string) => ResultAsync<void, GraphError>;
  readonly sendDigest: (markdown: string) => ResultAsync<void, GraphError>;
  readonly stop: () => void;
}

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export const startBot = (
  config: TelegramConfig,
  runtime: Runtime,
): ResultAsync<WellinformedBot, GraphError> => {
  if (!config.enabled || !config.bot_token) {
    return errAsync(GE.readError('telegram', 'bot not configured — run wellinformed telegram setup'));
  }

  try {
    const bot = new TelegramBot(config.bot_token, { polling: true });
    const allowedChat = config.chat_id;

    // Message handler
    bot.on('message', async (msg) => {
      if (String(msg.chat.id) !== allowedChat) return; // single-user whitelist
      const text = msg.text ?? '';

      // Check for URLs — inbound capture
      const urls = text.match(URL_RE);
      if (urls && urls.length > 0) {
        const reply = await handleCapture(runtime, urls, text);
        await bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
        return;
      }

      // No URL — treat as command or note
      const result = await handleCommand(runtime, text);
      await bot.sendMessage(msg.chat.id, result, { parse_mode: 'Markdown' });
    });

    const sendMessage = (text: string): ResultAsync<void, GraphError> =>
      ResultAsync.fromPromise(
        bot.sendMessage(allowedChat, text, { parse_mode: 'Markdown' }).then(() => undefined),
        (e) => GE.writeError('telegram', (e as Error).message),
      );

    const sendDigest = (markdown: string): ResultAsync<void, GraphError> => {
      // Telegram has 4096 char limit — truncate if needed
      const truncated = markdown.length > 4000
        ? markdown.slice(0, 3997) + '...'
        : markdown;
      return sendMessage(truncated);
    };

    const stop = (): void => {
      bot.stopPolling();
    };

    return okAsync({ sendMessage, sendDigest, stop });
  } catch (e) {
    return errAsync(GE.readError('telegram', (e as Error).message));
  }
};
