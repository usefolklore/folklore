/**
 * `wellinformed discover-loop [--room R] [--max-iterations N]`
 *
 * Recursive source expansion: discover → index → extract keywords →
 * discover again. Converges when no new sources found.
 */

import { formatError } from '../../domain/errors.js';
import { defaultRoom } from '../../domain/rooms.js';
import { discoveryLoop, type IterationReport } from '../../application/discovery-loop.js';
import { defaultRuntime } from '../runtime.js';

export const discoverLoopCmd = async (args: readonly string[]): Promise<number> => {
  let room: string | undefined;
  let maxIterations = 3;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--max-iterations') maxIterations = parseInt(next(), 10) || 3;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`discover-loop: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    if (!room) {
      const reg = await runtime.rooms.load();
      if (reg.isOk()) room = defaultRoom(reg.value);
    }
    if (!room) {
      console.error('discover-loop: no room specified and no default room set.');
      return 1;
    }

    console.log(`discovery loop for room '${room}' (max ${maxIterations} iterations)\n`);

    const deps = {
      ingestDeps: runtime.ingestDeps,
      rooms: runtime.rooms,
      sources: runtime.sources,
    };

    const result = await discoveryLoop(deps)(room, {
      maxIterations,
      onIteration: (r: IterationReport) => {
        console.log(`  iteration ${r.iteration}: +${r.new_sources} sources, +${r.new_nodes} nodes`);
        if (r.new_keywords.length > 0) {
          console.log(`    new keywords: ${r.new_keywords.join(', ')}`);
        }
      },
    });

    if (result.isErr()) {
      console.error(`discover-loop: ${formatError(result.error)}`);
      return 1;
    }

    const report = result.value;
    console.log(`\n${report.converged ? 'converged' : 'max iterations reached'}`);
    console.log(`total: +${report.total_sources_added} sources, +${report.total_nodes_added} nodes`);
    console.log(`final keywords: ${report.final_keywords.join(', ')}`);
    return 0;
  } finally {
    runtime.close();
  }
};
