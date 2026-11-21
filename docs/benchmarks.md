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
| NEAT Walker | pop 60 | 40 | 2.37 | 275.46 | +5 and champion replay >= 1.0 m | 25.3 | budget 300 s; population mean -6.07 -> 19.79; champion replay: 27.12 m in the full 15 s episode, upright 10.9 s, no fall |
| DQN Pong | env defaults (1 episode per round) | 160,000 env steps, 86 episodes | first 20% of episodes: mean -10.61 | last 20%: mean 11.81 | +5 (last 20% vs first 20%) | 6.1 | budget 240 s; steps doubled from the spec's 80,000, see below |
| PPO Car | env defaults (8 envs, rollout 128) | 150 updates | first 10 updates: mean -2.32 | last 10: mean 106.62 | +10 (last 10 vs first 10) | 7.0 | budget 240 s; no tuning needed |
| PPO reach1d (unit test `src/learner/ppoLearner.test.ts`) | env defaults with `train.ppo.gamma = 0.95` | 40 updates | first update: mean 5.0 | last 5: mean 10.6 | +3 | 1.3 | gamma lowered from 0.99, see below |

## Changes from spec

No NEAT benchmark iteration count was changed and no margin was lowered. The Car assertion was made stricter (see below). Walker passes at the spec's margin and distance; its physics knobs differ from the spec (see below).

DQN Pong (spec section 14.2): the step budget was doubled, 80,000 -> 160,000 env steps, the first tuning step the spec allows. At 80,000 steps seed 1 measured -10.85 -> -7.77 over 55 episodes (+3.1, below the +5 margin): the paddle had only just begun to track the ball. At 160,000 steps: seed 1 -10.61 -> 11.81, seed 2 -10.45 -> 8.53. Margin, seed, hyperparameters and reward are unchanged. PPO Car passed as specified.

PPO reach1d (spec section 14.2): `src/envs/reach1d.ts` sets `train.ppo.gamma = 0.95` (default 0.99), an env `train` override; the test still uses `resolveConfig('ppo', reach1d)`. With the default, seed 1 improved by +2.7 against the +3 required: the observation has no clock, so the value net cannot predict a long-horizon return and its loss stayed near 0.9. With 0.95, first update -> last 5: seed 1 5.0 -> 10.6, seed 2 4.0 -> 11.4, seed 3 4.4 -> 11.2.

Car track (spec section 10.4): three control points were moved, `(650,330) (700,430) (540,450)` -> `(700,330) (670,415) (550,450)`. The spec's list produced a hairpin with a 17 px radius of curvature at the bottom right, below the 45 px minimum that `src/envs/car/track.test.ts` requires for a drivable track. The Car benchmark was measured on the adjusted track.

Car grip limit (spec section 10.4): the spec's steering rule let the car take every corner at full throttle, so the task was "steer away from the nearer wall" and nothing else. Measured before the change: the generation-1 champion of seed 1 already drove 7 laps flat out (fitness 426.56 against a physical ceiling of about 485, 8 laps in the 50 s episode) and the best line was flat from generation 5 on. The reward terms were not the cause (checkpoints and laps made up 423 of the 426; speed added 5). The fix is in the physics: the turn rate is now `steer * min(2.8 * clamp(|speed| / 80, 0, 1), 220 / |speed|)`, a lateral-acceleration cap of 220 px/s^2, so corners need braking. Reward weights, presets, episode rules and the observation are unchanged. Seeds 1, 2, 3 with the cap: gen1 best 62 / 3 / 1, generation-30 best 320 / 318 / 323 (5 laps each); the first lap appears in generation 3 / 4 / 14. Caps tried: 500 and 400 (still flat out, gen1 of seed 1 over 300), 300 (gen1 279), 220 (chosen), 160 (learns, but only 4 laps in 30 generations). The benchmark now also asserts `last5 >= 2 x gen1` and that the champion replay completes at least 3 laps.

Walker physics (spec section 10.6), all in `WALKER` and `createWalkerSim` in `src/envs/walker/model.ts`. No reward weight, preset or `train` override was changed.

- Planar constraint: with translation or rotation axes locked on both bodies of a revolute joint, Rapier 0.21.0 blows up (a two-body pendulum reaches y = 20 m within a second). Only the torso is locked (z translation, x/y rotation); the legs are kept in its plane by the Z-axis joints, and their solver drift (up to 0.03 in a quaternion component over 15 s) is projected out after every step.
- Motors: the default acceleration-based motor model scales with the small inertia of the foot and shin and could not hold the body up, so motors are force-based. The spec's `(400, 28)` then collapses forward in about 1.5 s (gravity gives about 310 N m per rad about the ankles); stiffness 800 and damping 40 (`1.4 * sqrt(k)`, the plan's rule) stand for the whole episode. Solver iterations 8 instead of Rapier's default 4: with 4 the joints are soft and the figure drifts.
- Torque limit 150 N m per motor (not in the spec). Without it the first benchmark run passed on a pogo gait: 7.64 m in 4 s with the torso jumping to 2.07 m, then a fall (gen1 2.53, last5 72.35, 6.1 s). With the limit the champion strides at about 1.8 m/s with its torso between 0.9 and 1.3 m.
