# Concept from text: trials against a real LLM

Each run below is `npm run llm-trial`: the app's own prompt, client, parser, static scan, sandbox, validator and repair loop (at most 3 repairs), run headlessly in Node. A concept passes only when the validator accepts the module. Passing modules are saved next to this file as `.evolab-concept.json` and can be imported in the gallery ("Import concept file").

## Run 1

- Model: `gpt-6-luna` at https://api.openai.com/v1, 2026-11-21
- Note: one-concept probe. The API rejected the request before any completion: the client sent `temperature: 0.2`, which this model does not accept. Fixed in `src/gen/llm.ts` (the client now asks again without temperature); the prompt was not at fault.
- Pass rate: **0/1**
- Repairs used: 0 (1 chat calls)
- Average latency per call: 1.7 s
- Tokens: the API returned no usage

| Concept | Result | Repairs | Validator errors per failed attempt | Tokens in / out | Latency | Generated |
|---|---|---|---|---|---|---|
| learn to juggle a ball | FAIL | 0 | 1: LLM request failed (400): { "error": { "message": "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.", "type": "invalid_request_error", "param": "temp | n/a | 1.7 s | - |

## Run 2

- Model: `gpt-6-luna` at https://api.openai.com/v1, 2026-11-21
- Change since the previous run: client retries without temperature when the model rejects it (src/gen/llm.ts); prompt unchanged
- Pass rate: **5/5**
- Repairs used: 0 (5 chat calls)
- Average latency per call: 31.4 s
- Tokens: 11152 in, 18521 out
- Estimated cost: $0.0104 (at $0.1 in / $0.5 out per 1M tokens, list price on the run date, ignoring cached-input discounts)

| Concept | Result | Repairs | Validator errors per failed attempt | Tokens in / out | Latency | Generated |
|---|---|---|---|---|---|---|
| learn to juggle a ball | pass | 0 | - | 2231 / 3499 | 29.1 s | [Juggle the Ball](learn-to-juggle-a-ball.evolab-concept.json) (`gen-juggle-the-ball-39cf`) |
| balance a pole on a cart | pass | 0 | - | 2231 / 2668 | 21.8 s | [Cart-Pole Balance](balance-a-pole-on-a-cart.evolab-concept.json) (`gen-cart-pole-balance-991f`) |
| dodge falling rocks | pass | 0 | - | 2229 / 3709 | 31.5 s | [Dodge Falling Rocks](dodge-falling-rocks.evolab-concept.json) (`gen-dodge-falling-rocks-5362`) |
| land a lunar lander gently | pass | 0 | - | 2231 / 5000 | 43.2 s | [Lunar Lander](land-a-lunar-lander-gently.evolab-concept.json) (`gen-lunar-lander-4b26`) |
| catch apples in a basket | pass | 0 | - | 2230 / 3645 | 31.7 s | [Apple Basket](catch-apples-in-a-basket.evolab-concept.json) (`gen-apple-basket-6447`) |

### Browser check of the run 2 modules

Each of the five files was imported through the gallery's "Import concept file" (which re-validates it in the worker) in headless Chromium against `npm run dev`, then trained with NEAT at MAX speed until the fitness chart had at least 5 points. One-off Playwright script, not part of the suite.

| File | Fitness points when checked | Error banner | Page errors |
|---|---|---|---|
| balance-a-pole-on-a-cart | 19 | hidden | 0 |
| catch-apples-in-a-basket | 16 | hidden | 0 |
| dodge-falling-rocks | 18 | hidden | 0 |
| land-a-lunar-lander-gently | 19 | hidden | 0 |
| learn-to-juggle-a-ball | 23 | hidden | 0 |

## Run 3

- Model: `gpt-6-luna` at https://api.openai.com/v1, 2026-11-21
- Change since the previous run: validator adds a learnability check (random play must not survive to maxSteps with the best score, and must not always score the same); the prompt asks for ramping difficulty, terminal failure, per-step survival reward and dense rewards; the client remembers endpoints that reject temperature
- Pass rate: **5/5**
- Repairs used: 0 (5 chat calls)
- Average latency per call: 43.4 s
- Tokens: 11792 in, 26407 out
- Estimated cost: $0.0144 (at $0.1 in / $0.5 out per 1M tokens)

| Concept | Result | Repairs | Validator errors per failed attempt | Tokens in / out | Latency | Generated |
|---|---|---|---|---|---|---|
| learn to juggle a ball | pass | 0 | - | 2359 / 5095 | 42.4 s | [Juggle the Ball](learn-to-juggle-a-ball.evolab-concept.json) (`gen-juggle-the-ball-85b3`) |
| balance a pole on a cart | pass | 0 | - | 2359 / 3671 | 30.2 s | [Cart-Pole Balance](balance-a-pole-on-a-cart.evolab-concept.json) (`gen-cart-pole-balance-7f8f`) |
| dodge falling rocks | pass | 0 | - | 2357 / 5178 | 42.5 s | [Dodge Falling Rocks](dodge-falling-rocks.evolab-concept.json) (`gen-dodge-falling-rocks-f7ec`) |
| land a lunar lander gently | pass | 0 | - | 2359 / 7511 | 61.7 s | [Gentle Lunar Lander](land-a-lunar-lander-gently.evolab-concept.json) (`gen-gentle-lunar-lander-796f`) |
| catch apples in a basket | pass | 0 | - | 2358 / 4952 | 40.2 s | [Apple Basket Catch](catch-apples-in-a-basket.evolab-concept.json) (`gen-apple-basket-catch-0e4e`) |

### NEAT on the run 3 modules (headless, 30 generations)

Each run 3 file was trained with the headless trainer the benchmarks use (`runHeadless`, NEAT with the concept's defaults, default reward weights, seed 1) for 30 generations. One-off script, not part of the suite. "Last-5 best" is the highest best fitness of generations 26 to 30, as in `tests/bench/helpers.ts`.

| File | Gen-1 best | Last-5 best | Mean, gen 1 -> gen 30 | Improves? |
|---|---|---|---|---|
| balance-a-pole-on-a-cart | 65.18 | 65.74 | 4.09 -> 47.26 | **No (flat best).** A network of generation 1 is already at the reward ceiling; only the population mean improves. See the follow-up below. |
| catch-apples-in-a-basket | 11.77 | 57.03 | -2.97 -> 23.44 | yes |
| dodge-falling-rocks | 7.08 | 12.87 | 1.77 -> 1.89 | **Weak.** The best jumps to about 12.6 in generation 2 (the ceiling is about 13) and stays there, with dips to 4 to 7; the mean does not move. See the follow-up below. |
| land-a-lunar-lander-gently | 12.70 | 53.63 | -3.61 -> 5.25 | yes, noisy (best swings between about 14 and 54 from one generation to the next) |
| learn-to-juggle-a-ball | 11.87 | 42.02 | -0.50 -> 3.40 | yes |

For comparison, the run 2 "Dodge Falling Rocks" (kept as `src/gen/testdata/unlearnable-dodge.evolab-concept.json`, now rejected by the validator) gives gen-1 best 14.23, last-5 best 14.22 on the same script.

Follow-up on the two flagged modules (same script, 120 generations, seeds 1 and 2). Both are solved almost at once rather than unlearnable: the best fitness reaches the reward ceiling within about 10 generations and has nowhere to go after that.

| File | Seed | Best at generation 1, 11, 21, ..., 111, 120 | Ceiling |
|---|---|---|---|
| balance-a-pole-on-a-cart | 1 | 65.2 65.3 65.5 65.7 65.8 65.8 65.9 65.9 65.9 65.9 65.9 65.9 65.9 | about 66 (20 s survived with the pole upright and centred) |
| balance-a-pole-on-a-cart | 2 | 40.5 65.2 65.4 65.4 65.6 65.6 65.8 65.9 65.9 65.9 65.9 65.9 65.9 | |
| dodge-falling-rocks | 1 | 7.1 12.7 4.6 12.5 12.5 12.4 12.6 12.9 5.0 12.6 12.7 12.5 6.4 | about 13 (full survival 10, clearance up to 3) |
| dodge-falling-rocks | 2 | 4.0 12.5 6.1 12.8 12.5 12.3 12.6 2.0 12.6 12.5 6.8 4.9 3.1 | |

So neither is a good demonstration of gradual improvement: cart-pole is at its ceiling in generation 1 on seed 1 and by generation 11 on seed 2; Dodge improves once, early, and its best then swings between the ceiling and 2 to 7 because every generation is scored on new rock patterns. They were not regenerated: no cheap rollout separates "solved in 10 generations" from the three modules that keep improving, and asking the model again until NEAT happens to struggle would not be a fix.

What the learnability check does and does not catch: it plays up to 64 seeded random-action episodes and 32 episodes with random one-layer networks (what NEAT's first generation looks like). It rejects a module when all random-action episodes score the same, or when failure is possible yet untrained play lasts to `maxSteps` with the best score (one random-action episode, or at least 4 of the 32 networks). The run 2 Dodge is rejected on every seed tried (7 to 11 of 32 networks survive it). All five run 3 modules pass without a repair, so in this run the improvement over run 2 comes from the prompt, not from the repair loop. What it does not catch: a task that is merely easy, where untrained play fails but a learner reaches the ceiling within a few generations (the two modules above), and a ceiling in episodes of fixed length (no failure to survive).
