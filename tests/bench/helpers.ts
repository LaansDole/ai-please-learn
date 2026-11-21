import type { IterationStats } from '../../src/learner/types';

/** Max `best` over the final 5 iterations (spec section 14.2). */
export function last5(stats: IterationStats[]): number { return Math.max(...stats.slice(-5).map((s) => s.best)); }

export function meanOf(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }

/** One line per benchmark; copy the numbers into docs/benchmarks.md. */
export function report(name: string, stats: IterationStats[], ms: number): void {
  console.log(`[bench] ${name}: gen1 ${stats[0]!.best.toFixed(2)}, last5 ${last5(stats).toFixed(2)}, mean ${stats[0]!.mean.toFixed(2)} -> ${stats.at(-1)!.mean.toFixed(2)}, ${stats.length} iterations, ${(ms / 1000).toFixed(1)} s`);
}
