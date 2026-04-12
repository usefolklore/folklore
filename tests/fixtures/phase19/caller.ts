import { compute } from './callee.js';

export function runComputation(x: number): number {
  return compute(x) * 2;
}
