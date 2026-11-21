# Learning benchmarks

Measured with `npm run bench` (headless, seed 1, default reward preset; spec section 14.2). `last5` is the best fitness over the final 5 iterations, `gen1` the best of iteration 1. Machine: Apple Silicon (arm64), Node 22.

| Benchmark | Config | Iterations | gen1 best | last5 | Margin asserted | Seconds | Notes |
|---|---|---|---|---|---|---|---|
| NEAT reach1d | pop 50, 4 episodes | 20 | 12.33 | 14.22 | `last5 >= 12`, mean +2 (3.56 -> 7.54) | 0.1 | budget 20 s |
| NEAT Pong | env defaults (pop 150, 2 episodes) | 30 | 6.54 | 33.72 | +8 | 3.4 | budget 120 s; population mean -9.72 -> 5.22 |
| NEAT Snake | env defaults (pop 150, 2 episodes) | 40 | 11.05 | 215.05 | +40 | 0.3 | budget 120 s; population mean -4.44 -> 13.06 |
| NEAT Flappy | env defaults (pop 150) | 40 | 23.55 | 378.99 | +100 | 2.5 | budget 120 s; population mean 0.19 -> 165.90 |
| NEAT Car | pop 100 | 30 | 426.56 | 484.53 | +20 | 14.0 | budget 180 s; population mean 3.92 -> 158.78; one random genome already laps in generation 1, so the gain shows mostly in the mean |
| NEAT Tetris | pop 80 | 15 | 648.45 | 2429.40 | +300 | 2.4 | budget 180 s; population mean 25.12 -> 1184.91 |

## Changes from spec

No benchmark configuration, iteration count or margin was changed: all six pass as specified.

Car track (spec section 10.4): three control points were moved, `(650,330) (700,430) (540,450)` -> `(700,330) (670,415) (550,450)`. The spec's list produced a hairpin with a 17 px radius of curvature at the bottom right, below the 45 px minimum that `src/envs/car/track.test.ts` requires for a drivable track. The Car benchmark was measured on the adjusted track.
