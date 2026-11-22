# EvoLab guide

The detail behind the [README](../README.md): what each page does, how the learning methods differ, how generated code is contained, how to add a concept and where things live in the source.

Live app: <https://laansdole.github.io/evolab/>

## Gallery

| | |
|---|---|
| ![Gallery of concepts](screenshots/01-gallery.png) The gallery: six built-in concepts, your own next to them. | ![Playing Pong](screenshots/02-pong-play.png) Step 1: play it yourself and see every reward term count up. |
| ![Reward panel](screenshots/09-reward-panel.png) Step 2: rewards and penalties as sliders, presets or raw JSON. | ![Method picker](screenshots/11-method-picker.png) Step 3: choose a learning method; ones that cannot work say why. |
| ![Pong learning with NEAT](screenshots/03-pong-learn.png) Pong with NEAT: the live population drawn as ghosts. | ![Snake learning](screenshots/04-snake-learn.png) Snake with NEAT, the score in the left gutter. |
| ![Flappy learning](screenshots/05-flappy-learn.png) Flappy at x1: a whole generation flying at once. | ![Car learning](screenshots/06-car-learn.png) Car racing: seven distance sensors, steering and throttle. |
| ![Tetris learning](screenshots/07-tetris-learn.png) Tetris: the network scores every possible landing spot. | ![Walker learning](screenshots/08-walker-learn.png) The 3D walker: six joint targets. |
| ![Network view](screenshots/10-network-neat.png) The champion's network, with disabled connections shown. | ![Pong with DQN](screenshots/12-dqn-pong.png) DQN on Pong: loss, epsilon and Q-values. |
| ![Car with PPO](screenshots/13-ppo-car.png) PPO on the car: policy and value loss, entropy, action means. | ![Champion replay](screenshots/14-replay.png) The hall of fame replays any earlier champion. |
| ![Generated concept](screenshots/15-generated.png) A concept generated from text, training like a built-in. | ![The Create page](screenshots/17-create.png) The Create page: describe a game, paste a response or import a file. |
| ![Settings](screenshots/16-settings.png) Settings: OpenAI, LM Studio or Ollama. | |

## Addresses

Every page has a clean URL under the app's base (`/` in dev, `/evolab/` on the live site):

| Address | Page |
|---|---|
| `/evolab/` | The gallery. |
| `/evolab/pong` | A concept, at step 1. Built-in ids are `pong`, `snake`, `flappy`, `car`, `tetris`, `walker`. |
| `/evolab/pong/3` | The same concept at step 3 (steps are 1 to 4). |
| `/evolab/create` | Create a concept from text. |
| `/evolab/settings` | LLM provider settings. |

Links shared before the clean URLs (`#/c/pong/3`, `#/settings`) are rewritten to the new form on load.

## The journey

1. **Pick a concept** in the gallery.
2. **Play** it yourself (step 1). The table next to the game shows every reward term counting up as you play, so you see exactly what the machine will be scored on. The hint under the game lists its keys; **R** restarts (N for the walker, where R bends the right knee).
3. **Shape the reward** (step 2). Each term has a weight: drag a slider, pick a preset (default, aggressive, survivalist) or edit the JSON. Changes apply to a running session from the next generation and leave a marker on the fitness chart.
4. **See the network and pick a method** (step 3). Inputs on the left are what the agent senses, outputs on the right are what it can do. Choose NEAT, DQN or PPO; a method that cannot learn the concept is disabled and says why.
5. **Watch it learn** (step 4). The stage shows the population (or the single agent) live; charts track fitness, species or loss and exploration; the network redraws as it changes; every generation's champion lands in the hall of fame, where a click replays it and Export saves it as a JSON file that Import loads back.

Speed is a ladder: x1, x2, x5, x10, x100, x1000 and MAX. Up to x1000 the stage shows the training itself, skipping frames as needed; at MAX nothing is drawn while training and the stage replays each new champion instead. Speed never changes what is computed, only how fast: the same seed gives the same run at every speed. Pause with Space, finish one iteration with `.`, and move along the ladder with `[` and `]`.

## Learning methods

**NEAT** (NeuroEvolution of Augmenting Topologies) starts with a crowd of tiny random networks that have no hidden neurons. Each one plays; the best are kept, bred and mutated. Mutations can add neurons and connections, so the network itself grows over generations. Similar networks are grouped into species that compete mostly among themselves, which protects new ideas until they have had time to improve. There are no gradients, only selection.

**DQN** (Deep Q-Network) trains one fixed-shape network from its own memories. It plays, stores every moment in a replay buffer, and repeatedly nudges its estimate of "how good is each action here" toward what actually happened next. It starts by acting randomly (epsilon) and gradually trusts itself. It needs a small set of distinct actions.

**PPO** (Proximal Policy Optimization) trains one fixed-shape network that plays several copies of the game at once, then looks back over the batch and makes the better-than-expected actions more likely, in small clipped steps so that it does not forget what it knew. It works for buttons and for smooth controls such as steering or joint motors.

All three are written from scratch in TypeScript in this repository (`src/neat`, `src/nn`, `src/rl`); there is no ML library.

| Concept | Actions | NEAT | DQN | PPO |
|---|---|---|---|---|
| Pong | 3 buttons | yes | yes | yes |
| Snake | 3 buttons | yes | yes | yes |
| Flappy | 2 buttons | yes | yes | yes |
| Car racing | steer and throttle (continuous) | yes | no: needs distinct actions | yes |
| Tetris | scores candidate placements | yes | no | no |
| Walker 3D | six joint targets (continuous) | yes | no: needs distinct actions | yes |
| Generated concepts | buttons or continuous | yes | buttons only | yes |

Measured learning results per concept and method are in [benchmarks.md](benchmarks.md).

## Concept from text

Open the **Create** page ([`/evolab/create`](https://laansdole.github.io/evolab/create), also the "Make your own" card in the gallery) and type a sentence such as "balance a pole on a cart". EvoLab asks a language model for two things: a JSON description (observations, actions, reward terms, presets, keys) and one JavaScript function that implements the environment. The result is checked by a validator that actually runs it: sizes and ranges of observations, determinism under a seed, reward terms that actually move, episodes that do not end at once, a render that draws. If the check fails, the precise errors go back to the model, up to three times ("repairing 1/3"). Only a module that passes is added to your gallery.

**Settings.** Open [Settings](https://laansdole.github.io/evolab/settings) and pick a provider:

| Provider | Base URL | Default model | API key |
|---|---|---|---|
| OpenAI (default) | `https://api.openai.com/v1` | `gpt-6-luna` | required; stored only in your browser and sent only to OpenAI |
| LM Studio | `http://localhost:1234/v1` | the first chat model LM Studio lists | none |
| Ollama | `http://localhost:11434/v1` | `qwen2.5-coder:14b` | none |

The base URL and the model stay editable under each provider, so any other OpenAI-compatible endpoint works too; "Test connection" lists the models the server offers. The only things sent are your concept text and EvoLab's fixed prompt, and only to that endpoint. A non-local address shows a warning. With OpenAI selected and no key, the Create page asks for one instead of sending a request.

**Proxy or direct.** Under `npm run dev` and `npm run preview` a small Vite plugin (`tools/llmProxy.ts`) proxies requests to your LLM server, so no server-side setup is needed. The live site (or any static hosting) has no proxy, so the page calls the provider straight from the browser:

- OpenAI: works as is. The API allows browser requests from any origin, so it needs no setup beyond your own API key.
- LM Studio: Developer > Local Server > start the server and enable CORS.
- Ollama: `OLLAMA_ORIGINS=https://laansdole.github.io ollama serve`

**No LLM server at all?** Use "Paste a response": copy the prompt, paste it into any chat model, and paste the answer back. It goes through the same validator. This works everywhere, including the live site.

**Where concepts live.** Generated concepts are stored in your browser's IndexedDB, not on any server. Each card has View source, Export (a `.evolab-concept.json` file that "Import concept file" on the Create page loads elsewhere) and Delete.

Generated concepts are 2D with button or continuous actions; they can be trained with NEAT and PPO, and with DQN when they use buttons.

**Tested with** OpenAI `gpt-6-luna`. The numbers, the history of runs and the generated modules (importable `.evolab-concept.json` files) are in [llm-trial/RESULTS.md](llm-trial/RESULTS.md); `npm run llm-trial` repeats the trial with your own key.

## Sandbox and its limits

Generated code never runs on the page. It runs only inside Web Workers, behind five layers:

1. **Static scan** (`src/gen/scan.ts`). Before anything executes, the source is rejected if it mentions anything it has no business using: `import`, `require`, `eval`, `Function`, `fetch`, `WebSocket`, `self`, `globalThis`, `postMessage`, timers, `Date`, `Math.random`, prototype access, template literals, and more.
2. **Lockdown** (`src/gen/sandbox.ts`). The worker replaces its network and storage APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `caches`, `importScripts` and others) with functions that throw.
3. **Scoped evaluation.** The module is compiled in strict mode with all of those names, plus `self`, `globalThis`, `Date` and the timers, shadowed by `undefined`.
4. **Content Security Policy.** The dev and preview servers send a policy that only allows connections to the app's own origin, so code that somehow escaped layers 1 to 3 still could not reach another site.
5. **Watchdog.** The validator's worker is killed after 5 seconds without an answer, and a training worker that goes silent for 15 seconds is terminated.

Rendering leaves the sandbox only as a list of drawing commands, which the page paints.

Be clear about what this is. EvoLab is an experimental project; generated code is untrusted, and these layers are built to contain mistakes and casual misuse by a model you chose, not to stop a determined attacker. A hostile module can still burn CPU until the watchdog stops it. On static hosting the page's policy has to allow connections to your LLM endpoint, so layer 4 is weaker there and layers 1 to 3 carry the weight. Only generate, import or load concepts from sources you trust, and do not paste modules from sources you do not trust into a browser profile that can reach other services on localhost.

## Add a new concept in one file

A concept is one TypeScript file that exports an `EnvDefinition`. The reference, commented step by step, is [`src/envs/reach1d.ts`](../src/envs/reach1d.ts) (a dot that learns to slide onto a target; registered but hidden from the gallery).

1. Copy `src/envs/reach1d.ts` to `src/envs/<name>.ts`.
2. Fill in the definition:
   - `meta`: id, name, tagline, `dims` (`'2d'`), `fps`, `maxSteps`, which `learners` can train it, whether it can draw `ghosts`. The id becomes the address (`/evolab/<id>`), so it cannot be a reserved name such as `create` or `settings`.
   - `observation.labels`: one label per number the network sees.
   - `action`: `discrete` (button labels) or `continuous` (dial labels, each in -1..1).
   - `rewardTerms`: raw counters such as "food eaten" or "seconds alive". Weights are non-negative; the sign comes from `kind` (`reward` adds, `penalty` subtracts).
   - `presets`: named weight sets; the first must be `default` and equal the default weights.
   - `human`: the keys for step 1, and `humanAct` in the env to turn held keys into an action. Leave R (or N) unbound so the restart hotkey stays available.
   - `create()`: returns one env instance; many run side by side, so all state lives in the closure.
3. Keep to the `Env` contract:
   - deterministic per seed: all randomness comes from `Rng` seeded in `reset`; no `Math.random`, no clock;
   - no allocation in `step` or `observe` (reuse typed arrays): they run millions of times;
   - `done` is false after `reset`; `step` updates the raw `terms`, never weights;
   - `render` draws on an 800 x 500 logical canvas and clears first, unless `view.ghost` is set, in which case it draws only the agent.
4. Register it with one line in `src/envs/index.ts`.
5. Run `npm test`. The conformance suite (`src/env/conformance.ts`) checks every registered env automatically: observation sizes and ranges, determinism, reward terms that move, rendering, `humanAct`.
6. Add a learning benchmark in `tests/bench/` with `benchNeat` from `tests/bench/helpers.ts` (five lines; see `tests/bench/pong.bench.test.ts`).

## Tests

| Command | What it proves |
|---|---|
| `npm test` | Unit tests: seeded RNG, reward engine, every env's conformance and determinism, NEAT operators and XOR, gradient checks of the hand-written backprop, DQN and PPO on toy problems, the sandbox and validator, persistence, the router. |
| `npm run bench` | The learning benchmarks: each method really learns each concept from a fixed seed. |
| `npm run perf` | Throughput floors for the training hot paths (generations per minute per concept, MLP and NEAT network speed). |
| `npm run e2e` | Playwright in Chromium: the full journey for all six concepts, DQN and PPO, live reward edits, champion export and import, concept from text against a fake LLM, the provider presets, and the GitHub Pages build served from a plain static server under `/evolab/`. |
| `npm run build` | Strict type check and the production bundle. |

`EVOLAB_SCREENSHOTS=1 npm run e2e -- screenshots` regenerates the images in [screenshots](screenshots).

## Project layout

| Path | What lives there |
|---|---|
| `src/core` | Seeded random numbers and small math helpers. |
| `src/env` | The Env SDK: types, registry, reward engine, drawing-command recorder, conformance suite. |
| `src/envs` | The built-in concepts, one file or folder each. |
| `src/neat` | NEAT: genomes, innovation numbers, mutation, crossover, speciation, reproduction. |
| `src/nn` | A small MLP with manual backprop, Adam and the DQN/PPO losses. |
| `src/rl` | Replay buffer, DQN agent, GAE, PPO agent. |
| `src/learner` | One tick-based `Learner` interface over NEAT, DQN and PPO, so speed control is only a scheduler. |
| `src/trainer` | The Web Worker, its message protocol, the speed scheduler, and the headless runner used by tests. |
| `src/gen` | Concept from text: prompt, parser, static scan, sandbox, validator, repair loop, provider settings, IndexedDB library. |
| `src/persist` | localStorage preferences and champion export/import. |
| `src/viz` | Hand-drawn Canvas2D charts and the network graph. |
| `src/three` | The three.js stage for 3D concepts (loaded only when one is opened). |
| `src/ui` | Pages (gallery, concept, Create, Settings), panels, router and styles in plain TypeScript; no framework. |
| `tools/llmProxy.ts` | The Vite plugin that proxies LLM requests under dev and preview. |
| `tests/bench`, `tests/perf`, `tests/e2e` | Learning benchmarks, throughput guards, Playwright suites. |
| `docs/benchmarks.md`, `docs/llm-trial`, `docs/screenshots` | Measured numbers, text-to-game trials and the images on this page. |

Runtime dependencies are `three` (3D view) and `@dimforge/rapier3d-compat` (walker physics). Nothing else.

## Out of scope

Not in this version: generated 3D or physics-engine concepts; generated concepts with candidate-placement actions; multi-agent self-play; GPU or WebGPU training; recurrent NEAT links and activation-function mutation; free (non-planar) walker balance and walker arms; DQN for Tetris or for continuous actions; prioritised replay, dueling networks, observation normalisation; resumable training runs and a persisted hall of fame; side-by-side comparison of generations; streaming LLM responses; a hyperparameter editor beyond seed and population; translations; accounts, sharing or cloud sync; a hosted LLM proxy for the static site.
