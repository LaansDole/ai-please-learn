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
- Demo video page linked from the gallery.

### Changed

- Clean URLs without the `#` and the `/c`.
- OpenAI is the default LLM provider, with LM Studio and Ollama as presets.
- README is shorter; the detail moved to DEVELOPER.md and docs/guide.md.

### Fixed

- The first LLM request sends no temperature, so it no longer fails with a 400.
- The learnability check also plays untrained networks, so games with nothing to learn are rejected.
- The router leaves links to static files and in-page anchors to the browser.

## 0.1.0 - 2026-11-21

### Added

- Six games: Pong, Snake, Flappy, a racing car, Tetris and a 3D walker.
- NEAT, DQN and PPO written from scratch in TypeScript.
- Reward panel, live network graph, fitness and species charts, speed controls.
- Hall of fame replays and champion export and import.
- Games generated from a text description, with a sandboxed validator, a repair loop and a local library.
- GitHub Pages deployment.
