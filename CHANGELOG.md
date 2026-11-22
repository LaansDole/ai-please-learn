# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 2026-11-22

### Added

- Snake shows the food eaten on the stage.
- R restarts the game in "Play it yourself".
- GitHub link in the top bar.
- "Make your own" has its own Create page.
- Favicon.
- DEVELOPER.md, CHANGELOG.md and docs/guide.md.
- Math tab: a report on how NEAT, DQN and PPO work in this code, with equations, hyperparameters and open problems. Its source is docs/math.md.
- Demo video page linked from the gallery.
- Demo tab in the top bar. The demo page has the same top bar, so Gallery, Create and Settings are one click back.
- Fitness chart: axis titles and a "best so far" line that only steps up.
- Species chart: a legend with each species' share, and axis titles.
- UX review of the live site: docs/design/ux-review-2026-11-22.md.

### Changed

- Field guide redesign. Light paper palette, Gill Sans and Charter type, and a shell-green top bar across the app, the games, the 3D stage and the demo page.
- Gallery: the four steps and a "Start with Snake" button sit beside the concept plates.
- Learn step: a generation header that says in words whether it is still learning, a strip of the last 60 generations, a record readout, species standings and a table of the last 8 generations beside the stage.
- Fitness chart: the record is a stepped blue line with its value and generation written on it. Every line ends in its latest value.
- Network on the Learn step: the 14 strongest connections are drawn in full and the rest faint.
- Clean URLs without the `#` and the `/c`.
- OpenAI is the default LLM provider, with LM Studio and Ollama as presets.
- README is shorter; the detail moved to DEVELOPER.md and docs/guide.md.
- Species chart shows the species that matter, smoothed, each in one colour for the whole run; small ones share a grey band.
- The demo page uses the app's colours and type, and its chapter list works from the keyboard.
- The game stays in view while a long side panel scrolls on wide screens.
- The build copies the demo page to `demo/`; dev and preview serve it too.

### Fixed

- The first LLM request sends no temperature, so it no longer fails with a 400.
- The learnability check also plays untrained networks, so games with nothing to learn are rejected.
- The router leaves links to static files and in-page anchors to the browser.
- Mean and median labels on the fitness chart no longer touch.
- The DQN fitness chart no longer draws best, mean and median on top of every episode's dot.

## 0.1.0 - 2026-11-21

### Added

- Six games: Pong, Snake, Flappy, a racing car, Tetris and a 3D walker.
- NEAT, DQN and PPO written from scratch in TypeScript.
- Reward panel, live network graph, fitness and species charts, speed controls.
- Hall of fame replays and champion export and import.
- Games generated from a text description, with a sandboxed validator, a repair loop and a local library.
- GitHub Pages deployment.
