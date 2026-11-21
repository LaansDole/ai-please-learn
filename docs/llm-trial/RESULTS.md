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
