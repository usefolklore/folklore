/**
 * `akashik mcp start` — start the MCP stdio server.
 *
 * Spawned by Claude Code via `.claude-plugin/plugin.json` or
 * manually by the user for debugging. Runs until the transport
 * closes (stdin EOF / SIGTERM).
 */

import { formatError } from '../../domain/errors.js';
import { defaultRuntime } from '../runtime.js';
import { startMcpServer } from '../../mcp/server.js';

export const mcp = async (args: readonly string[]): Promise<number> => {
  const [sub] = args;
  if (sub !== 'start' && sub !== undefined) {
    console.error(`mcp: unknown subcommand '${sub}'. try: mcp start`);
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`mcp: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    await startMcpServer(runtime);
    // startMcpServer runs until the transport closes; we never reach
    // this point in normal operation.
    return 0;
  } catch (e) {
    console.error(`mcp: fatal — ${(e as Error).message}`);
    return 1;
  } finally {
    runtime.close();
  }
};
