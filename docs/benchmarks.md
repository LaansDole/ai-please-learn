# Learning benchmarks

Measured with `npm run bench` (headless, seed 1, default reward preset; spec section 14.2). `last5` is the best fitness over the final 5 iterations, `gen1` the best of iteration 1. Machine: Apple Silicon (arm64), Node 22.

| Benchmark | Config | Iterations | gen1 best | last5 | Margin asserted | Seconds | Notes |
|---|---|---|---|---|---|---|---|
| NEAT reach1d | pop 50, 4 episodes | 20 | 12.33 | 14.22 | `last5 >= 12`, mean +2 (3.56 -> 7.54) | 0.1 | budget 20 s |
| NEAT Pong | env defaults (pop 150, 2 episodes) | 30 | 6.54 | 33.72 | +8 | 3.4 | budget 120 s; population mean -9.72 -> 5.22 |
| NEAT Snake | env defaults (pop 150, 2 episodes) | 40 | 11.05 | 215.05 | +40 | 0.3 | budget 120 s; population mean -4.44 -> 13.06 |

## Changes from spec

None. All three benchmarks pass with the spec's configuration, iteration counts and margins.
