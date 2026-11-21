# Learning benchmarks

Measured with `npm run bench` (headless, seed 1, default reward preset; spec section 14.2). `last5` is the best fitness over the final 5 iterations, `gen1` the best of iteration 1. Machine: Apple Silicon (arm64), Node 22.

| Benchmark | Config | Iterations | gen1 best | last5 | Margin asserted | Seconds | Notes |
|---|---|---|---|---|---|---|---|
| NEAT reach1d | pop 50, 4 episodes | 20 | 12.33 | 14.22 | `last5 >= 12`, mean +2 (3.56 -> 7.54) | 0.1 | budget 20 s |
| NEAT Pong | env defaults (pop 150, 2 episodes) | 30 | 6.54 | 33.72 | +8 | 3.4 | budget 120 s; population mean -9.72 -> 5.22 |
| NEAT Snake | env defaults (pop 150, 2 episodes) | 40 | 11.05 | 215.05 | +40 | 0.3 | budget 120 s; population mean -4.44 -> 13.06 |
| NEAT Flappy | env defaults (pop 150) | 40 | 23.55 | 378.99 | +100 | 2.5 | budget 120 s; population mean 0.19 -> 165.90 |
| NEAT Car | pop 100 | 30 | 62.39 | 319.51 | +20, `last5 >= 2 x gen1`, champion replay >= 3 laps | 9.5 | budget 180 s; population mean -2.92 -> 69.43; champion replay (seed 1): 5 laps, 217 checkpoints, no crash; measured with the grip limit below |
| NEAT Tetris | pop 80 | 15 | 648.45 | 2429.40 | +300 | 2.4 | budget 180 s; population mean 25.12 -> 1184.91 |

## Changes from spec

No benchmark iteration count was changed and no margin was lowered. The Car assertion was made stricter (see below).

Car track (spec section 10.4): three control points were moved, `(650,330) (700,430) (540,450)` -> `(700,330) (670,415) (550,450)`. The spec's list produced a hairpin with a 17 px radius of curvature at the bottom right, below the 45 px minimum that `src/envs/car/track.test.ts` requires for a drivable track. The Car benchmark was measured on the adjusted track.

Car grip limit (spec section 10.4): the spec's steering rule let the car take every corner at full throttle, so the task was "steer away from the nearer wall" and nothing else. Measured before the change: the generation-1 champion of seed 1 already drove 7 laps flat out (fitness 426.56 against a physical ceiling of about 485, 8 laps in the 50 s episode) and the best line was flat from generation 5 on. The reward terms were not the cause (checkpoints and laps made up 423 of the 426; speed added 5). The fix is in the physics: the turn rate is now `steer * min(2.8 * clamp(|speed| / 80, 0, 1), 220 / |speed|)`, a lateral-acceleration cap of 220 px/s^2, so corners need braking. Reward weights, presets, episode rules and the observation are unchanged. Seeds 1, 2, 3 with the cap: gen1 best 62 / 3 / 1, generation-30 best 320 / 318 / 323 (5 laps each); the first lap appears in generation 3 / 4 / 14. Caps tried: 500 and 400 (still flat out, gen1 of seed 1 over 300), 300 (gen1 279), 220 (chosen), 160 (learns, but only 4 laps in 30 generations). The benchmark now also asserts `last5 >= 2 x gen1` and that the champion replay completes at least 3 laps.
