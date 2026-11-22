# EvoLab

Watch neural networks learn to play games in your browser, with no backend and no account.

**Live app** at <https://laansdole.github.io/evolab/>

![A population of stick-figure walkers learning to walk, with the champion's network, fitness and species charts](docs/screenshots/08-walker-learn.png)

## What it does

- **Six games.** Pong, Snake, Flappy, a racing car, Tetris and a two-legged 3D walker.
- **Three learning methods.** NEAT, DQN and PPO, written from scratch in TypeScript with no ML library.
- **Make your own.** Describe a game in a sentence on the [Create](https://laansdole.github.io/evolab/create) page and an LLM writes it.
- **You set the reward.** Play the game, weight each reward and penalty, then watch the network learn at any speed.

## Run locally

```bash
npm install
npm run dev
```

See [DEVELOPER.md](DEVELOPER.md) for tests, builds and LLM setup.

## Credits

- [Code Bullet](https://www.youtube.com/@CodeBullet) made the "AI learns to play X" videos that inspired this project.
- [ml-visualized.com](https://ml-visualized.com/) inspired showing the network as it learns.
- The walker's manual controls follow [QWOP](https://www.foddy.net/Athletics.html) by Bennett Foddy.
- Methods: NEAT (Stanley & Miikkulainen 2002), DQN (Mnih et al. 2015), PPO (Schulman et al. 2017) - full references in [DEVELOPER.md](DEVELOPER.md#references).
- Built with [three.js](https://threejs.org/) and [Rapier](https://rapier.rs/).

More: [DEVELOPER.md](DEVELOPER.md) | [CHANGELOG.md](CHANGELOG.md) | [docs/guide.md](docs/guide.md)

[MIT](LICENSE), copyright (c) 2026 Do Le Long An.
