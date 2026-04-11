/**
 * Inbound capture — URL → classify room → ingest.
 *
 * When a user forwards a URL to the bot:
 *   1. Classify which room it belongs to (keyword similarity)
 *   2. Fetch + parse via the generic_url adapter
 *   3. Ingest into the graph via indexNode
 *   4. Reply with a summary
 */

import { formatError } from '../domain/errors.js';
import { findRoom, roomIds } from '../domain/rooms.js';
import { indexNode } from '../application/use-cases.js';
import type { Runtime } from '../cli/runtime.js';

/**
 * Classify a URL to the best-matching room by comparing the message
 * text against each room's keywords. Simple term overlap score.
 */
const classifyRoom = async (
  runtime: Runtime,
  text: string,
): Promise<string | null> => {
  const reg = await runtime.rooms.load();
  if (reg.isErr()) return null;
  const registry = reg.value;
  const rooms = roomIds(registry);
  if (rooms.length === 0) return null;
  if (rooms.length === 1) return rooms[0];

  const words = text.toLowerCase().split(/\s+/);
  let bestRoom = rooms[0];
  let bestScore = 0;

  for (const rid of rooms) {
    const room = findRoom(registry, rid);
    if (!room) continue;
    const keywords = room.keywords.map((k) => k.toLowerCase());
    let score = 0;
    for (const w of words) {
      for (const k of keywords) {
        if (w.includes(k) || k.includes(w)) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRoom = rid;
    }
  }
  return bestRoom;
};

export const handleCapture = async (
  runtime: Runtime,
  urls: string[],
  messageText: string,
): Promise<string> => {
  const room = await classifyRoom(runtime, messageText);
  if (!room) {
    return 'No rooms configured. Run `wellinformed init` first.';
  }

  const results: string[] = [];
  const useCase = indexNode({
    graphs: runtime.graphs,
    vectors: runtime.vectors,
    embedder: runtime.embedder,
  });

  for (const url of urls.slice(0, 3)) { // max 3 URLs per message
    const fetchResult = await runtime.http.get(url);
    if (fetchResult.isErr()) {
      results.push(`Failed: ${url} — ${formatError(fetchResult.error)}`);
      continue;
    }

    const htmlResult = await runtime.html.extract(fetchResult.value.body, url);
    if (htmlResult.isErr()) {
      results.push(`Failed to extract: ${url}`);
      continue;
    }

    const article = htmlResult.value;
    const node = {
      id: url,
      label: article.title || url,
      file_type: 'document' as const,
      source_file: url,
      source_uri: url,
      fetched_at: new Date().toISOString(),
      room,
    };

    const indexResult = await useCase({
      node,
      text: article.text,
      room,
    });

    if (indexResult.isOk()) {
      results.push(`Indexed: *${article.title || url}* → room \`${room}\``);
    } else {
      results.push(`Failed to index: ${url}`);
    }
  }

  return results.join('\n') || 'No URLs processed.';
};
