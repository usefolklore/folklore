/**
 * `akashik discover-loop`
 *
 * V5 (Phase 24) STUB. The recursive source-expansion loop was
 * room-keyword-driven; with rooms deleted the engine has no per-room
 * keyword set to walk. Command stays as a stub so legacy scripts don't
 * break; a replacement (workspace-keyword index or source-affinity
 * graph) is deferred to Phase 25+.
 */

export const discoverLoopCmd = async (_args: readonly string[]): Promise<number> => {
  console.log('discover-loop: stub (V5).');
  console.log('');
  console.log('  Note: the per-room recursive source expansion engine was removed in');
  console.log('  Phase 24 along with the room abstraction. A replacement is deferred');
  console.log('  to Phase 25+.');
  return 0;
};
