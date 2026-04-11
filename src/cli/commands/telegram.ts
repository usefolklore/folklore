/**
 * `wellinformed telegram <sub>`
 *
 *   setup     — guide user through BotFather token creation
 *   test      — send a test message to verify the bot works
 *   start     — start the bot in foreground (for testing)
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { formatError } from '../../domain/errors.js';
import { loadTelegramConfig, startBot } from '../../telegram/bot.js';
import { defaultRuntime, runtimePaths } from '../runtime.js';

const setup = async (): Promise<number> => {
  console.log(`
wellinformed telegram setup

1. Open Telegram and message @BotFather
2. Send /newbot and follow the prompts
3. Copy the bot token (looks like 123456:ABC-DEF...)
4. Get your chat ID by messaging @userinfobot
`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(`  ${q}: `, (a) => resolve(a.trim())));

  const token = await ask('Bot token from @BotFather');
  const chatId = await ask('Your chat ID from @userinfobot');
  rl.close();

  if (!token || !chatId) {
    console.error('Both token and chat ID are required.');
    return 1;
  }

  // Write to config.yaml
  const paths = runtimePaths();
  const configPath = join(paths.home, 'config.yaml');
  let config = '';
  if (existsSync(configPath)) {
    config = readFileSync(configPath, 'utf8');
  }

  // Append or update telegram section
  if (config.includes('telegram:')) {
    config = config.replace(
      /telegram:[\s\S]*?(?=\n\w|\n$|$)/,
      `telegram:\n  enabled: true\n  bot_token: "${token}"\n  chat_id: "${chatId}"\n`,
    );
  } else {
    config += `\ntelegram:\n  enabled: true\n  bot_token: "${token}"\n  chat_id: "${chatId}"\n`;
  }
  writeFileSync(configPath, config);
  console.log(`\nSaved to ${configPath}`);
  console.log('Run `wellinformed telegram test` to verify.');
  return 0;
};

const test = async (): Promise<number> => {
  const paths = runtimePaths();
  const configPath = join(paths.home, 'config.yaml');
  if (!existsSync(configPath)) {
    console.error('No config.yaml found. Run `wellinformed telegram setup` first.');
    return 1;
  }

  const { parse } = await import('yaml');
  const raw = parse(readFileSync(configPath, 'utf8')) ?? {};
  const tgConfig = loadTelegramConfig(raw);
  if (!tgConfig) {
    console.error('Telegram not configured. Run `wellinformed telegram setup`.');
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(formatError(rt.error));
    return 1;
  }

  const bot = await startBot(tgConfig, rt.value);
  if (bot.isErr()) {
    console.error(`Bot failed: ${formatError(bot.error)}`);
    rt.value.close();
    return 1;
  }

  const result = await bot.value.sendMessage('wellinformed bot is working. Send a URL to ingest or type a command.');
  bot.value.stop();
  rt.value.close();

  if (result.isErr()) {
    console.error(`Send failed: ${formatError(result.error)}`);
    return 1;
  }

  console.log('Test message sent. Check your Telegram.');
  return 0;
};

const startForeground = async (): Promise<number> => {
  const paths = runtimePaths();
  const configPath = join(paths.home, 'config.yaml');
  if (!existsSync(configPath)) {
    console.error('No config.yaml. Run `wellinformed telegram setup`.');
    return 1;
  }

  const { parse } = await import('yaml');
  const raw = parse(readFileSync(configPath, 'utf8')) ?? {};
  const tgConfig = loadTelegramConfig(raw);
  if (!tgConfig) {
    console.error('Telegram not configured.');
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(formatError(rt.error));
    return 1;
  }

  console.log('Starting Telegram bot (foreground, Ctrl+C to stop)...');
  const bot = await startBot(tgConfig, rt.value);
  if (bot.isErr()) {
    console.error(`Bot failed: ${formatError(bot.error)}`);
    rt.value.close();
    return 1;
  }

  console.log('Bot running. Listening for messages...');

  // Keep alive until SIGINT
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      bot.value.stop();
      rt.value.close();
      resolve();
    });
  });
  return 0;
};

export const telegram = async (args: readonly string[]): Promise<number> => {
  const [sub] = args;
  switch (sub) {
    case 'setup': return setup();
    case 'test': return test();
    case 'start': return startForeground();
    default:
      console.error(`telegram: unknown subcommand '${sub ?? ''}'. try: setup | test | start`);
      return 1;
  }
};
