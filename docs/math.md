# How the learners work

## Purpose of ai-please-learn

EvoLab (the repository is `ai-please-learn`) exists to let you watch neural networks visibly learn games in the browser, in the spirit of [Code Bullet](https://www.youtube.com/@CodeBullet) and [ml-visualized.com](https://ml-visualized.com/). You play the game first, set the rewards, pick NEAT, DQN or PPO, and watch it learn. You can also describe a new game in a sentence and an LLM writes it.

It is for learners and researchers who want to see and poke at learning dynamics. It is not a benchmark suite or a production RL library. It is a personal learning project.

This report is the math behind what you see on the screen, plus the open problems that are left.

A technical report on the mathematics that EvoLab runs. It is written for a reader who knows reinforcement learning and wants to know exactly what this code does, where it follows the papers and where it does not. Every number below is read from the source at the linked file. Nothing is tuned per run behind the scenes.

All three learners are written from scratch in TypeScript: [`src/neat`](../src/neat), [`src/nn`](../src/nn) and [`src/rl`](../src/rl). There is no ML library and no GPU. Networks compute in 32-bit floats.

## 1. Overview and notation

Every concept is one environment definition ([`src/env/types.ts`](../src/env/types.ts)) and every session walks the same four steps.

1. **Play.** A person plays the environment. The reward terms count up next to the game.
2. **Rewards.** The person sets a magnitude $\lvert w_k \rvert \ge 0$ for each reward term, and the term's kind gives the sign of $w_k$. This fixes the objective (Section 3).
3. **Network.** The person picks a learner: NEAT, DQN or PPO. The page shows the policy network it will train.
4. **Learn.** The learner runs in a Web Worker. The page charts its progress (Section 8).

| Symbol | Meaning | In the code |
|---|---|---|
| $s_t$, $o_t$ | state and observation at step $t$ | `env.observe()`, a `Float32Array` |
| $a_t$ | action | index, vector in $[-1, 1]^d$, or candidate index |
| $c_k(t)$ | cumulative counter of reward term $k$ | `env.terms[k]` |
| $w_k$ | signed weight of term $k$ | `signedWeights()` |
| $r_t$ | reward at step $t$ | Eq. 3.2 |
| $F$ | fitness of an episode | Eq. 3.1 |
| $T$ | episode length, at most `maxSteps` | `meta.maxSteps` |
| $\gamma$, $\lambda$ | discount and GAE parameter | `gamma`, `lambda` |
| $\theta$, $\theta^-$ | network parameters, target-network parameters | `Mlp.params` |
| $Q_\theta$, $V_\theta$, $\pi_\theta$ | action value, state value, policy | DQN net, PPO value head, PPO policy head |
| $\delta$ | compatibility distance (NEAT) or TD residual (GAE), by context | `distance()`, `computeGae()` |
| $N$ | population size (NEAT) | `populationSize` |

One **iteration** is the unit on every chart. It is one generation for NEAT, one rollout plus update for PPO, and one round of `episodesPerIteration` episodes for DQN ([`src/learner/types.ts`](../src/learner/types.ts)). These units are not comparable in cost (Section 11.2).

## 2. Environments as decision processes

Each environment is an episodic Markov decision process with a hand-written observation $o_t = \phi(s_t)$, scaled to about $[-1, 1]$. The observation does not always determine the state (Snake senses the cells next to its head and the direction of the food, not the board), so the tasks are partially observed in general. All policies here are memoryless: they map $o_t$ to $a_t$ with a feed-forward network.

An episode ends when the environment sets `done` (termination) or after `maxSteps` steps (truncation). The two cases are treated differently by the gradient learners (Sections 5 and 6).

| Concept | $\dim o$ | Actions | Step cap | Terminates when |
|---|---:|---|---:|---|
| [Pong](../src/envs/pong.ts) | 6 | discrete, 3 | 3000 | either side reaches 5 points |
| [Snake](../src/envs/snake.ts) | 9 | discrete, 3 | 2000 | wall or body hit, board full, or more than $100 + 4\ell$ steps without food at length $\ell$ |
| [Flappy](../src/envs/flappy.ts) | 5 | discrete, 2 | 6000 | pipe, floor or ceiling hit |
| [Car racing](../src/envs/car/car.ts) | 8 | continuous, 2 | 3000 | wall hit, or 240 steps without a new checkpoint |
| [Tetris](../src/envs/tetris/tetris.ts) | 6 | candidates | 500 | no legal placement |
| [Walker 3D](../src/envs/walker/walker.ts) | 21 | continuous, 6 | 900 | torso below 0.7 m or pitched more than 1.0 rad |
| Generated ([`src/gen/meta.ts`](../src/gen/meta.ts)) | 1 to 32 | discrete 2 to 8, or continuous 1 to 6 | 50 to 5000 | written by the model |

**Action types.** A discrete policy outputs one score per action and the greedy action is the argmax. A continuous policy outputs a vector in $[-1, 1]^d$. Tetris uses a third type, `candidates`: the environment lists the feature vector of every legal placement, the network scores each one with a single output, and the best score is played ([`src/learner/policy.ts`](../src/learner/policy.ts)). This is afterstate evaluation. Only NEAT supports it. DQN needs discrete actions and PPO needs discrete or continuous ones ([`src/env/registry.ts`](../src/env/registry.ts)).

**Seeding.** The only source of randomness is a mulberry32 generator ([`src/core/rng.ts`](../src/core/rng.ts)). Gaussian samples use the Box-Muller transform. Seeds for sub-streams come from `hashSeed`, an FNV-style integer hash. With run seed $z$:

| Stream | Seed |
|---|---|
| NEAT mutation and selection | `hashSeed(z, 0x4e454154)` |
| NEAT episode $e$ of generation $g$, shared by every genome | `hashSeed(z, g, e)` |
| DQN agent (init, exploration, replay sampling) | `hashSeed(z, 0x44514e)` |
| DQN episode $j$ | `hashSeed(z, j)` |
| PPO agent (init, action sampling, minibatch order) | `hashSeed(z, 0x50504f)` |
| PPO episode $j$ of parallel environment $e$ | `hashSeed(z, e, j)` |

A run is a deterministic function of $z$, the reward weights and the config. Speed settings change how often the page draws and never what is computed. In NEAT every genome of a generation plays the same episode seeds, so genomes are compared under common random numbers. The seeds change with the generation, so a champion's fitness is re-drawn every generation wherever the environment uses its seed (Section 11.9). Two built-in concepts use it little or not at all. The walker ignores its seed ([`src/envs/walker/walker.ts`](../src/envs/walker/walker.ts)): every episode starts from the same deterministic world, so an unchanged genome scores the same in every generation. The car uses its seed only to pick one of 8 start positions on the track, `seed % 8` ([`src/envs/car/car.ts`](../src/envs/car/car.ts)).

## 3. Reward shaping

An environment exposes cumulative counters $c_k(t)$, one per reward term, with $c_k(0) = 0$. The Rewards step sets a magnitude for each term. The sign comes from the term's kind: reward terms get $+w$, penalty terms get $-w$ ([`src/env/reward.ts`](../src/env/reward.ts)). Fitness is the weighted sum of the final counters:

$$
F = \sum_k w_k \, c_k(T) \tag{3.1}
$$

NEAT uses $F$ directly. DQN and PPO need a reward per step, which is the weighted increment of the counters ([`src/learner/dqnLearner.ts`](../src/learner/dqnLearner.ts), [`src/learner/ppoLearner.ts`](../src/learner/ppoLearner.ts)):

$$
r_t = \sum_k w_k \, \bigl( c_k(t) - c_k(t-1) \bigr) \tag{3.2}
$$

The sum telescopes, so the undiscounted return equals the fitness: $\sum_{t=1}^{T} r_t = F$. All three learners therefore optimise the same episode score, up to discounting in DQN and PPO. This is what makes the charts of different methods comparable on the vertical axis.

**Shaping.** Most built-in terms are shaping terms: Pong pays for keeping the paddle level with the ball, Snake pays for steps toward the food, the car is paid for speed, the walker for staying upright. Ng, Harada and Russell (1999) show that adding a shaping reward $f$ leaves the optimal policy unchanged when it is a potential difference,

$$
f(s, a, s') = \gamma \, \Phi(s') - \Phi(s) \tag{3.3}
$$

for some function $\Phi$ of the state, and that for a general $f$ no such guarantee holds. EvoLab does **not** restrict terms to this form. Terms are arbitrary counters and the weights are free, so a user can make the shaped optimum differ from the task optimum. That is the point of the Rewards step: it shows reward design, including its failure modes.

One built-in pair is close to potential-based. Snake counts `approach` and `retreat` steps separately, each with default weight 0.1. With equal weights their sum is $-0.1$ times the change in distance to the food, which is Eq. 3.3 with $\Phi = -0.1 \, d$ and $\gamma = 1$. It stops being a potential when the two weights differ, when $\gamma < 1$ (DQN and PPO use 0.99) and at the step that eats the food, where the distance jumps and nothing is paid for it.

A reward change during a run is staged and applied at the next iteration boundary. The fitness scale changes with it, so the record on the chart starts over there (Section 8).

## 4. NEAT

NeuroEvolution of Augmenting Topologies (Stanley and Miikkulainen, 2002) evolves both the weights and the structure of small networks. Config: [`src/neat/config.ts`](../src/neat/config.ts).

### 4.1 Genome and network

A genome is a list of node genes (id, type, bias, activation) and a list of connection genes (innovation number, source, target, weight, enabled flag), sorted by innovation number ([`src/neat/genome.ts`](../src/neat/genome.ts)). The first generation has no hidden nodes: every input is connected to every output with weights drawn from $\mathcal{N}(0, 1)$ and all biases are 0.

A node computes $y_j = \sigma_j \bigl( b_j + \sum_i w_{ij} \, y_i \bigr)$. Hidden nodes use $\sigma = \tanh$. Output nodes use $\tanh$, or the identity when the output is a candidate score. The paper uses a steepened sigmoid, $1 / (1 + e^{-4.9 x})$. EvoLab uses $\tanh$ because continuous actions live in $[-1, 1]$ and it needs no rescaling.

Networks are strictly feed-forward. The add-connection mutation rejects any link that would close a cycle, and the network is evaluated once per step in topological order ([`src/neat/network.ts`](../src/neat/network.ts)). The paper allows recurrent links. EvoLab does not, so a NEAT policy has no memory.

### 4.2 Innovation numbers

Each new connection $(i \to j)$ gets a global innovation number. The same structural mutation gets the same number wherever it occurs, which lets crossover align genes without graph matching ([`src/neat/innovation.ts`](../src/neat/innovation.ts)). The paper resets this lookup every generation. EvoLab keeps one table for the whole run, so a link that is re-invented fifty generations later is still the same gene. Splitting a connection likewise always yields the same new node id, unless the genome already contains that node.

### 4.3 Compatibility distance and speciation

For two genomes with $E$ excess genes, $D$ disjoint genes and mean absolute weight difference $\overline{W}$ over matching genes ([`src/neat/species.ts`](../src/neat/species.ts)):

$$
\delta = \frac{c_1 E}{n} + \frac{c_2 D}{n} + c_3 \, \overline{W} \tag{4.1}
$$

with $c_1 = 1.0$, $c_2 = 1.0$, $c_3 = 0.4$. Here $n$ is the number of connection genes in the larger genome, and $n = 1$ when that number is below 20. These are the coefficients of the paper.

Genomes are assigned in order to the first species whose representative is closer than the threshold $\delta_t$, or found a new species. The representative is a random member of the species in the previous generation. The threshold starts at the paper's $\delta_t = 3.0$.

**Deviation: the threshold moves.** The paper keeps $\delta_t$ fixed. EvoLab steers the number of species $\lvert \mathcal{S} \rvert$ toward a target of 8 with a fixed step after every speciation:

$$
\delta_t \leftarrow \operatorname{clip}\bigl( \delta_t + 0.15 \, \operatorname{sign}( \lvert \mathcal{S} \rvert - 8 ), \; 0.3, \; 10 \bigr) \tag{4.2}
$$

The reason is practical. With a fixed threshold the species count depends on the observation and action sizes, which range from 5 inputs (Flappy) to 21 (Walker), and a single value does not suit all six concepts. The cost is that species boundaries drift for a reason unrelated to fitness (Section 11.7).

### 4.4 Fitness sharing and offspring allocation

The paper divides each fitness by the species size, $f'_i = f_i / \lvert S \rvert$, and gives each species offspring in proportion to $\sum_{i \in S} f'_i$. That requires non-negative fitness. EvoLab's fitness can be negative, so it is shifted by the population minimum first ([`src/neat/population.ts`](../src/neat/population.ts)):

$$
\bar{f}_S = \frac{1}{\lvert S \rvert} \sum_{i \in S} \bigl( \max(0, \, f_i - f_{\min}) + 10^{-6} \bigr) \tag{4.3}
$$

Species $S$ then receives a quota of the $N$ slots in proportion to $\bar{f}_S$, rounded by the largest-remainder method with a minimum of one slot per surviving species. A large species cannot take over the population on size alone, since its members share one mean.

**Stagnation.** A species whose best fitness has not improved for 15 generations is removed, except that the 2 species with the highest best-ever fitness are always kept.

**Elitism.** The best genome of the population is copied unchanged into slot 0. The best genome of every species with at least 5 members is also copied unchanged.

**Parents.** Within a species the top 20% by fitness (at least one genome) may reproduce.

### 4.5 Crossover and mutation

Each remaining slot is filled as follows. With probability 0.75 the child is a crossover of two parents, otherwise a clone of one. The second parent normally comes from the same top 20% as the first. With probability 0.001, and only when more than one species survives, it is instead drawn from all members of a randomly chosen surviving species, not only that species' top 20%. The chosen species can be the first parent's own. The child then mutates.

**Crossover** ([`src/neat/crossover.ts`](../src/neat/crossover.ts)). The child has exactly the nodes and connections of the fitter parent. For a matching gene the weight (and for a matching node the bias) comes from either parent with probability 0.5. A gene that is disabled in either parent is disabled in the child with probability 0.75. With equal fitness the paper takes disjoint and excess genes from both parents. EvoLab breaks the tie by genome id and still takes one parent's structure, which keeps every child acyclic without a check.

**Mutation** ([`src/neat/mutation.ts`](../src/neat/mutation.ts)). The steps are independent:

| Mutation | Probability per genome | Effect |
|---|---:|---|
| Weights | 0.8 | each weight is replaced by a draw from $\mathcal{N}(0, 1)$ with probability 0.1, otherwise perturbed by $\mathcal{N}(0, 0.5^2)$. Weights are clamped to $[-8, 8]$ |
| Biases | 0.3 | every non-input bias is perturbed by $\mathcal{N}(0, 0.3^2)$ and clamped to $[-8, 8]$ |
| Toggle | 0.01 | one random connection flips its enabled flag |
| Add connection | 0.10 | up to 20 tries to find an unconnected, acyclic pair. New weight from $\mathcal{N}(0, 1)$. A try that picks a pair whose connection exists but is disabled re-enables that connection and stops |
| Add node | 0.05 | splits an enabled connection. Incoming weight 1, outgoing weight the old weight. At most 64 hidden nodes |

The 0.8 and 0.1 weight probabilities and the 0.75 and 0.001 rates are the paper's. The paper perturbs weights uniformly and uses structural rates of 0.05 (add connection) and 0.03 (add node) for its small populations. EvoLab perturbs with Gaussians, mutates biases as separate genes and uses higher structural rates, so that growth is visible within the first minutes of a browser session.

### 4.6 Population and evaluation

| Concept | Population $N$ | Episodes per genome |
|---|---:|---:|
| Pong | 150 | 2 |
| Snake | 150 | 2 |
| Flappy | 150 | 1 |
| Car racing | 100 | 1 |
| Tetris | 80 | 1 |
| Walker 3D | 60 | 1 |
| Generated | 150 | 1 |

The default is $N = 150$ with one episode per genome. Per-concept overrides are in each environment file under `train`. A genome's fitness is the mean of Eq. 3.1 over its episodes ([`src/learner/neatLearner.ts`](../src/learner/neatLearner.ts)). The Learn step lets the user change $N$ for a run.

## 5. DQN

Deep Q-Network (Mnih et al., 2015) with the Double DQN target (van Hasselt, Guez and Silver, 2016). Config: `DEFAULT_DQN` in [`src/learner/config.ts`](../src/learner/config.ts). Agent: [`src/rl/dqn.ts`](../src/rl/dqn.ts).

**Network.** A multilayer perceptron with layer sizes $[\dim o, 32, 32, \lvert \mathcal{A} \rvert]$, ReLU hidden units and a linear output: one Q-value per action. Weights are initialised from $\mathcal{N}(0, 1/\text{fan-in})$ and biases to 0 ([`src/nn/mlp.ts`](../src/nn/mlp.ts)). The paper's network is convolutional and reads pixels. EvoLab's reads the feature vector of Section 2.

**Behaviour policy.** Epsilon-greedy, with $\varepsilon$ decaying linearly in the number of environment steps $n$:

$$
\varepsilon(n) = 1.0 + (0.05 - 1.0) \cdot \min\Bigl( 1, \frac{n}{30000} \Bigr) \tag{5.1}
$$

**Replay.** Transitions $(o, a, r, o', d)$ go into a ring buffer of 50,000 entries and are sampled uniformly with replacement ([`src/rl/replay.ts`](../src/rl/replay.ts)). The flag $d$ is 1 only for a true termination. An episode cut off by the step cap is stored with $d = 0$, so the target still bootstraps from $o'$ (Pardo et al., 2018).

**Target.** The online network picks the next action and the target network evaluates it:

$$
y = r + \gamma \, (1 - d) \; Q_{\theta^-}\bigl( o', \; \arg\max_{a'} Q_\theta(o', a') \bigr), \qquad \gamma = 0.99 \tag{5.2}
$$

Mnih et al. use $\max_{a'} Q_{\theta^-}(o', a')$, which overestimates. Eq. 5.2 is the Double DQN correction.

**Loss.** The Huber loss (Huber, 1964) with threshold 1 on the TD error $e = Q_\theta(o, a) - y$, averaged over a minibatch of 32 ([`src/nn/losses.ts`](../src/nn/losses.ts)):

$$
\ell(e) = \tfrac{1}{2} e^2 \;\; \text{if } \lvert e \rvert \le 1, \qquad \ell(e) = \lvert e \rvert - \tfrac{1}{2} \;\; \text{otherwise} \tag{5.3}
$$

Its gradient is the error clipped to $[-1, 1]$, which is the error clipping described in the paper.

**Schedule.** One gradient step every 4 environment steps, starting once 1,000 steps have been observed. The target network is a hard copy, $\theta^- \leftarrow \theta$, every 1,000 environment steps. There is no soft (Polyak) update.

| Setting | EvoLab | Mnih et al. (2015) |
|---|---|---|
| Replay capacity | 50,000 | 1,000,000 |
| Minibatch | 32 | 32 |
| Discount $\gamma$ | 0.99 | 0.99 |
| Update period | 4 steps | 4 steps |
| Learning starts | 1,000 steps | 50,000 frames |
| Target sync | 1,000 steps | 10,000 updates |
| $\varepsilon$ schedule | 1.0 to 0.05 over 30,000 steps | 1.0 to 0.1 over 1,000,000 frames |
| Optimizer | Adam, learning rate $5 \times 10^{-4}$ | RMSProp, learning rate $2.5 \times 10^{-4}$ |
| Gradient clipping | global L2 norm 10, plus Eq. 5.3 | error clipping |
| Parallel environments | 1 | 1 |

The EvoLab column is scaled for tasks that are learned in $10^5$ steps in a browser tab, not $10^7$ frames. One DQN iteration (a "round") is 5 episodes by default and 1 episode in Pong.

## 6. PPO

Proximal Policy Optimization (Schulman et al., 2017) with generalised advantage estimation (Schulman et al., 2016). Config: `DEFAULT_PPO` in [`src/learner/config.ts`](../src/learner/config.ts). Agent: [`src/rl/ppo.ts`](../src/rl/ppo.ts). Losses: [`src/nn/losses.ts`](../src/nn/losses.ts).

**Network.** One perceptron with layer sizes $[\dim o, 32, 32, d + 1]$ and $\tanh$ hidden units. The first $d$ outputs parametrise the policy and the last output is the value $V_\theta(o)$. Policy and value share the whole trunk. The last layer's weights are scaled by 0.01 at initialisation, so the first policy is close to uniform (discrete) or zero-mean (continuous).

**Action distributions.**

- Discrete: categorical, $\pi_\theta(a \mid o) = \operatorname{softmax}(z)_a$ over the $d$ logits $z$.
- Continuous: diagonal Gaussian, $a \sim \mathcal{N}\bigl( \mu_\theta(o), \operatorname{diag}(\sigma^2) \bigr)$. The log standard deviations are $d$ free parameters that do not depend on the state. They start at $-0.5$ and are clamped to $[-2.5, 0.5]$ after every step. The environment receives $\operatorname{clip}(a, -1, 1)$ while the log-probability is that of the unclipped sample. There is no $\tanh$ squashing and no correction for the clipping.

For replays the policy is deterministic: the argmax of the logits, or the clipped mean.

**Rollout.** 8 environments run in parallel for 256 steps each, which gives 2,048 transitions per update. Environments are reset in place when an episode ends.

**Advantages.** Computed backwards per environment ([`src/rl/gae.ts`](../src/rl/gae.ts)), with $\gamma = 0.99$ and $\lambda = 0.95$:

$$
\delta_t = r_t + \gamma \, V^{\text{next}}_t - V(o_t), \qquad \hat{A}_t = \delta_t + \gamma \lambda \, (1 - e_t) \, \hat{A}_{t+1} \tag{6.1}
$$

Here $e_t = 1$ when the episode ended at step $t$ for either reason, which stops the recursion from crossing into the next episode. The bootstrap value depends on why it ended: $V^{\text{next}}_t = 0$ after a termination, $V^{\text{next}}_t = V(o^{\text{final}}_t)$ after a truncation by the step cap (evaluated on the last observation before the reset), and $V(o_{t+1})$ otherwise. The value target is $\hat{R}_t = \hat{A}_t + V(o_t)$.

**Objective.** With probability ratio $\rho_t = \pi_\theta(a_t \mid o_t) / \pi_{\text{old}}(a_t \mid o_t)$ and clip range $\epsilon = 0.2$, each minibatch $B$ minimises

$$
L = \frac{1}{\lvert B \rvert} \sum_{t \in B} \Bigl[ -\min\bigl( \rho_t \tilde{A}_t, \; \operatorname{clip}(\rho_t, 1 - \epsilon, 1 + \epsilon) \, \tilde{A}_t \bigr) + c_v \bigl( V_\theta(o_t) - \hat{R}_t \bigr)^2 \Bigr] - c_e \, \overline{H} \tag{6.2}
$$

with $c_v = 0.5$. The entropy coefficient is $c_e = 0.01$ for discrete actions and $c_e = 0$ for continuous ones. $\overline{H}$ is the mean entropy of the policy over the minibatch. For the Gaussian policy it is $\sum_j (\log \sigma_j + \tfrac{1}{2} \log 2 \pi e)$, the same for every state. $\tilde{A}$ is the advantage normalised within the minibatch:

$$
\tilde{A}_t = \frac{\hat{A}_t - \operatorname{mean}_B(\hat{A})}{\operatorname{std}_B(\hat{A}) + 10^{-8}} \tag{6.3}
$$

**Optimisation.** 4 epochs over the rollout, reshuffled each epoch, in minibatches of 256. That is 8 minibatches per epoch and 32 gradient steps per update. Gradients of the network are clipped to global L2 norm 0.5 and applied with Adam at learning rate $3 \times 10^{-4}$. The log standard deviations have their own Adam instance at the same rate and are not clipped.

**Deviations from common PPO implementations.** All of these are deliberate simplifications, and each is a candidate for the ablations in Section 11.5.

- The value loss is the plain squared error of Eq. 6.2. There is no value-function clipping.
- The learning rate is constant. There is no annealing.
- Observations and rewards are not normalised.
- Policy and value share one network instead of using two.
- The log-ratio is clamped to $[-20, 20]$ before exponentiation, so $\rho_t$ cannot overflow.
- The losses shown on the page are the means over the final epoch only.
- The log standard deviations are free parameters that do not depend on the state, clamped to $[-2.5, 0.5]$. They are not a network output.
- Actions are clipped for the environment and scored as the unclipped sample, with no squashing and no correction.
- The 0.01 scale of the last layer applies to the value output as well as the policy outputs.
- There is no entropy bonus for continuous actions ($c_e = 0$).

## 7. Optimizer

Both gradient learners use Adam (Kingma and Ba, 2015) with $\beta_1 = 0.9$, $\beta_2 = 0.999$ and $\varepsilon = 10^{-8}$ ([`src/nn/adam.ts`](../src/nn/adam.ts)). For gradient $g_t$ at step $t$:

$$
m_t = \beta_1 m_{t-1} + (1 - \beta_1) \, g_t, \qquad v_t = \beta_2 v_{t-1} + (1 - \beta_2) \, g_t^2 \tag{7.1}
$$

$$
\alpha_t = \alpha \, \frac{\sqrt{1 - \beta_2^t}}{1 - \beta_1^t}, \qquad \theta_t = \theta_{t-1} - \alpha_t \, \frac{m_t}{\sqrt{v_t} + \varepsilon} \tag{7.2}
$$

This is the form the Adam paper gives at the end of its Section 2, with both bias corrections folded into the step size. It differs from the paper's Algorithm 1 only in where $\varepsilon$ enters: here it is added to $\sqrt{v_t}$ and not to the bias-corrected $\sqrt{\hat{v}_t}$. The moments are kept in 64-bit floats.

| Learner | Learning rate $\alpha$ | Gradient clip (global L2 norm) |
|---|---:|---:|
| DQN | $5 \times 10^{-4}$ | 10 |
| PPO | $3 \times 10^{-4}$ | 0.5 |

Clipping rescales the whole gradient: $g \leftarrow g \cdot \min(1, \, c / \lVert g \rVert_2)$. A step whose gradient contains a NaN or an infinity is skipped entirely, so that one bad batch cannot poison the moments. There is no weight decay and no learning-rate schedule.

## 8. What the charts measure

Let $b_i$, $\mu_i$ and $\tilde{m}_i$ be the best, mean and median episode score of iteration $i$. For NEAT they are taken over the population's fitnesses. For DQN and PPO they are taken over the episodes that finished during the iteration. A PPO update in which no episode finished has no score, and the charts show a gap. The median is the element at index $\lfloor n/2 \rfloor$ of the sorted scores, which is the upper median for even $n$.

**Record.** The running maximum $R_i = \max_{j \le i} b_j$, drawn as a stepped line. After a reward change at iteration $i_0$ the scale of $F$ is different, so the maximum is taken over $j \ge i_0$ only ([`src/viz/trend.ts`](../src/viz/trend.ts)).

**The strip of the last 60 iterations.** Each iteration gets one of four marks: *none* if it has no score or lies before the last reward change, else *record* if $b_i > R_{i-1}$, else *improved* if $b_i$ is above the mean of the scored iterations among the 10 before it, not counting any before the last reward change, else *no gain*.

**Verdict for NEAT.** Let $k$ be the number of generations since the record was set. The header says "New record" when $k = 0$, "Still learning" when $0 < k < 30$ and "Stalled" when $k \ge 30$.

**Verdict for DQN and PPO.** One lucky episode can hold the record for a long time while the agent still improves, so `rlVerdict` reads the mean instead. It smooths $\mu_i$ with an exponential moving average, $\alpha = 0.1$,

$$
\bar{\mu}_i = \bar{\mu}_{i-1} + \alpha \, (\mu_i - \bar{\mu}_{i-1}), \qquad d_i = \mu_i - \bar{\mu}_{i-1} \tag{8.1}
$$

and compares the average now with the average $L = \min(30, \, n - 1)$ iterations ago against one standard deviation of the average itself:

$$
\text{learning} \iff \bar{\mu}_n - \bar{\mu}_{n-L} > \sqrt{ \frac{\alpha}{2 - \alpha} \cdot \frac{1}{\lvert D \rvert} \sum_{i \in D} d_i^2 } \tag{8.2}
$$

Here $D$ is the set of scored iterations among the last $L$, so the noise term is a mean over scored iterations and not over all $L$. The first scored iteration of a run has no $d_i$ and is left out. The factor $\alpha / (2 - \alpha)$ is the variance of an exponential average of independent noise relative to the variance of that noise. With fewer than 10 scored iterations the verdict is "too early to tell". This is a one-sigma heuristic, not a significance test: the threshold was chosen so that a visibly rising DQN Pong run is not called stalled, as the comment in the source says.

**Smoothed line on the fitness chart.** For DQN and PPO the chart plots one dot per finished episode with return $G_j$ and an average $\bar{G}_j = 0.9 \, \bar{G}_{j-1} + 0.1 \, G_j$ ([`src/ui/panels/learn.ts`](../src/ui/panels/learn.ts)). This average runs over episodes. The verdict's average runs over iterations. Both use $\alpha = 0.1$.

**Species chart.** Band height is a species' share of the population, $\lvert S \rvert / N$. Each generation shows its 6 largest species and pools the rest into one grey band (`speciesBands` in [`src/viz/scale.ts`](../src/viz/scale.ts)). Long runs are sampled down to at most 240 columns (`SPECIES_COLUMNS` in [`src/ui/panels/learn.ts`](../src/ui/panels/learn.ts), applied with `sampleEvenly` from `scale.ts`) and shares are smoothed with a centred moving average of radius $\min(4, \lfloor n/12 \rfloor)$ columns, so the chart shows the trend and the exact shares are in the standings table next to it.

**Network view.** When a network has more than 30 enabled connections, the 14 with the largest $\lvert w \rvert$ are drawn in full and the rest faint ([`src/viz/nnLayout.ts`](../src/viz/nnLayout.ts)). This ranks by weight magnitude only. It is not a saliency measure: a large weight on an input that barely varies matters less than the drawing suggests. For DQN and PPO each edge is also tinted by $\lvert \Delta w \rvert / \max \lvert \Delta w \rvert$ since the previous snapshot, computed in `mlpSnapshot` ([`src/learner/mlpPolicy.ts`](../src/learner/mlpPolicy.ts)).

## 9. Generated concepts

The Create page asks a language model for a new environment. The model returns a metadata block and a JavaScript module that implements the contract of Section 2: `reset(seed)`, `step(action)`, `observe()`, `done`, `terms`, `render` and `humanAct`. The metadata bounds are in the last row of the table in Section 2. The module then has to pass these gates, in order ([`src/gen/validator.ts`](../src/gen/validator.ts)):

1. **Static scan.** The source is at most 40,000 characters and names none of a list of forbidden identifiers such as `fetch`, `eval`, `Date` and `Math.random` ([`src/gen/scan.ts`](../src/gen/scan.ts)).
2. **Sandbox.** The module is compiled and run only inside a Web Worker with network and storage APIs disabled. A watchdog kills the worker after 5 seconds.
3. **Conformance.** 2,000 steps of uniformly random actions from seed 12345: shapes match the metadata, every observation is finite and within $\pm 100$, at least one reward counter changes, rendering produces valid commands, and two instances given the same seed and actions agree for 300 steps ([`src/env/conformance.ts`](../src/env/conformance.ts)).
4. **Learnability.** Described below.
5. **Budget.** The whole validation takes at most 3,000 ms.

On failure the validator's sentences are sent back to the model, for at most 3 repair rounds.

**The learnability check as a test.** The question is whether a learner has anything to improve. The check plays two batches under the default weights, each bounded by 60,000 steps: up to 64 episodes with uniformly random actions and up to 32 episodes with random linear policies, $a = \arg\max (W o + b)$ or $\tanh(W o + b)$ with entries from $\mathcal{N}(0, 1)$. The linear policies are what NEAT's first generation looks like. Write $F^{\text{rand}}_j$ for the fitnesses of the first batch and call an episode *full* if it lasted to `maxSteps`. The module is rejected when one of three rules fires.

- **No signal:** $\max_j F^{\text{rand}}_j - \min_j F^{\text{rand}}_j < 10^{-9}$.
- **Ceiling reached by random actions:** some episode in either batch ended early (failure is possible), at least 1 random-action episode is full, and a full episode holds the best fitness of that batch.
- **Ceiling reached by untrained networks:** failure is possible, at least 4 of the 32 linear-policy episodes are full, and a full episode holds the best fitness of that batch.

Read as a hypothesis test, the null is "untrained play does not reach the ceiling" and the statistic is a count of full episodes. If a random-action episode is full with probability $p$, independently across episodes, and $m$ random-action episodes are played, the second rule sees at least one with probability

$$
1 - (1 - p)^{m} \tag{9.1}
$$

The batch starts no new episode once 60,000 steps are used, so $m$ is about $\min(64, \, 60000 / \bar{T})$ for a mean episode length $\bar{T}$. It is 64 only when episodes are short, and as few as 12 when `maxSteps` is 5,000 and episodes run long. At $m = 64$ the probability is 0.96 for $p = 0.05$, the rate measured on the module that motivated the check, and 0.47 for $p = 0.01$. Both values are upper bounds. The third rule requires 4 of 32 because, as the source notes, one lucky linear policy in 32 also survives in Pong, Tetris and the walker, where surviving is far from the best score. Nothing in the check bounds the false-positive rate, and it cannot see a task that is learnable but trivially easy (Section 11.10).

## 10. Measured results

All numbers are copied from [`docs/benchmarks.md`](benchmarks.md) and [`docs/llm-trial/RESULTS.md`](llm-trial/RESULTS.md). They come from `npm run bench`: headless runs with the default reward weights and the per-concept config, on one Apple Silicon machine.

**Read these as smoke tests, not as results.** Every row is a single run with seed 1. There are no confidence intervals and no comparison across methods at equal cost. Most assertions only require that the last iterations beat the first by a margin. Two ask for more ([`tests/bench`](../tests/bench)): the car also requires the best of the last 5 generations to be at least twice the generation-1 best and its champion to replay at least 3 laps, and the walker requires its champion to replay at least 1.0 m forward. Section 11.1 says what a proper evaluation needs.

| Method and concept | Budget | First | Last | Wall time |
|---|---|---:|---:|---:|
| NEAT Pong | 30 generations | 6.54 | 33.72 | 3.4 s |
| NEAT Snake | 40 generations | 11.05 | 215.05 | 0.3 s |
| NEAT Flappy | 40 generations | 23.55 | 378.99 | 2.5 s |
| NEAT Car racing | 30 generations | 62.39 | 319.51 | 9.5 s |
| NEAT Tetris | 15 generations | 648.45 | 2429.40 | 2.4 s |
| NEAT Walker 3D | 40 generations | 2.37 | 275.46 | 25.3 s |
| DQN Pong | 160,000 steps, 86 episodes | -10.61 | 11.81 | 6.1 s |
| PPO Car racing | 150 updates | -2.32 | 106.62 | 7.0 s |

For NEAT, "First" is the best fitness of generation 1 and "Last" is the best over the final 5 generations. For DQN they are the mean return of the first and last 20% of episodes. For PPO they are the mean of the per-update mean return over the first and last 10 updates. The NEAT and gradient rows therefore report different statistics (best versus mean) and must not be compared with each other.

Three details from the benchmark notes matter when reading the table.

- DQN Pong failed its margin at the original budget of 80,000 steps (seed 1: -10.85 to -7.77) and passed after the budget was doubled. A second seed at 160,000 steps reached 8.53.
- The walker's champion covered 27.12 m in the 15 s episode without falling. An earlier physics setting passed the same benchmark with a hopping gait that fell after 4 s, which the fitness margin alone did not catch.
- The benchmark table used to label the PPO car run "rollout 128". That label was stale: `DEFAULT_PPO.rolloutLen` was already 256 when the row was measured ([`src/learner/config.ts`](../src/learner/config.ts)), so the run used 256 steps per environment. The label now says 256 and the measurement stands.

**Generated concepts.** In the recorded trial against one hosted model, 5 of 5 prompts passed validation with 0 repair rounds. NEAT then ran for 30 generations on each module with seed 1:

| Generated concept | Best, generation 1 | Best, generations 26 to 30 | Reading |
|---|---:|---:|---|
| Catch apples in a basket | 11.77 | 57.03 | improves |
| Land a lunar lander | 12.70 | 53.63 | improves, noisy |
| Juggle a ball | 11.87 | 42.02 | improves |
| Balance a pole on a cart | 65.18 | 65.74 | at the ceiling of about 66 from generation 1 |
| Dodge falling rocks | 7.08 | 12.87 | at the ceiling of about 13 from generation 2 |

Two of five validated modules leave a learner nothing to do after a few generations. That is a small sample from one model on one day, and it is the main open problem of the generator (Sections 11.10 and 11.11).

## 11. Room for improvement

This section lists what a researcher should distrust or would want to change. Each item states what the code does now, why it matters, a concrete change with a reference, and how to tell whether the change helped. Effort is S (a day), M (a few days) or L (weeks).

| Item | Effort | Expected impact |
|---|---|---|
| [11.1 Single-seed reporting](#111-single-seed-reporting) | S | high |
| [11.2 Budgets are not comparable across methods](#112-budgets-are-not-comparable-across-methods) | S | high |
| [11.3 No observation or reward normalisation](#113-no-observation-or-reward-normalisation) | M | medium to high |
| [11.4 DQN is the 2016 baseline](#114-dqn-is-the-2016-baseline) | M | medium |
| [11.5 PPO implementation details](#115-ppo-implementation-details) | M | medium |
| [11.6 Shaping changes the task](#116-shaping-changes-the-task) | S | medium |
| [11.7 The speciation controller is untested](#117-the-speciation-controller-is-untested) | S | low to medium |
| [11.8 Objective-only search on a deceptive task](#118-objective-only-search-on-a-deceptive-task) | L | uncertain |
| [11.9 Noisy fitness and elitism](#119-noisy-fitness-and-elitism) | S | medium |
| [11.10 Power of the learnability check](#1110-power-of-the-learnability-check) | M | medium |
| [11.11 Generated games plateau early](#1111-generated-games-plateau-early) | M | high for the generator |

### 11.1 Single-seed reporting

`Effort S` `Impact high`

- **Now.** Every benchmark in [`tests/bench`](../tests/bench) runs seed 1 once and asserts a margin. `docs/benchmarks.md` reports point values. A few of its notes mention a second or third seed in prose.
- **Why it matters.** Deep RL results vary strongly with the seed (Henderson et al., 2018). A single run cannot separate a real effect from luck, and every tuning decision recorded in the benchmark notes was made on one or two seeds.
- **Change.** Run each configuration on at least 10 seeds. Report the interquartile mean with stratified bootstrap confidence intervals and performance profiles, as recommended by Agarwal et al. (2021). `runHeadless` already takes a seed, so this is a loop and a statistics helper.
- **Evaluate.** The change is the evaluation. A first useful output: how many of the current benchmark margins hold on 10 of 10 seeds.

### 11.2 Budgets are not comparable across methods

`Effort S` `Impact high`

- **Now.** The horizontal axis of every chart is the iteration ([`src/ui/panels/learn.ts`](../src/ui/panels/learn.ts)). A NEAT generation on Pong is up to $150 \times 2 \times 3000$ environment steps. A PPO update is 2,048. A DQN round in Pong is one episode. Each learner already records cumulative `envSteps` ([`src/learner/types.ts`](../src/learner/types.ts)), and the charts do not use it.
- **Why it matters.** "NEAT learned Pong in 30 generations and DQN needed 86 episodes" says nothing about sample efficiency. NEAT also reports the best of $N$ policies while DQN and PPO report the mean of one, which favours NEAT further.
- **Change.** Offer environment steps as the horizontal axis, and report the same statistic for all methods: the return of the current greedy policy (or champion) on a fixed set of held-out evaluation seeds.
- **Evaluate.** Sample-efficiency curves per concept with the three methods on one plot, score against environment steps, with the intervals of 11.1.

### 11.3 No observation or reward normalisation

`Effort M` `Impact medium to high`

- **Now.** Observations are scaled by hand in each environment to "roughly $[-1, 1]$", and the conformance check accepts anything within $\pm 100$. Rewards reach the learners unscaled: the nonzero default weights range from 0.005 to 20 and Tetris fitness exceeds 2,000. The PPO value head regresses raw returns with a squared error ([`src/nn/losses.ts`](../src/nn/losses.ts)).
- **Why it matters.** The value loss and the policy loss share one gradient and one clipping norm of 0.5, so the scale of the returns sets their balance. A user who multiplies all weights by 10 changes the optimisation, not only the chart. Generated environments make this worse, since a model picks their scales.
- **Change.** Running mean and variance normalisation of observations, and reward scaling by a running estimate of the return's standard deviation. Both are among the code-level choices studied by Engstrom et al. (2020), and Andrychowicz et al. (2021) find observation normalisation to matter in most of their environments.
- **Evaluate.** Sensitivity test: train with all reward weights multiplied by 0.1, 1 and 10. With normalisation the three learning curves, rescaled, should overlap. Today they should not.

### 11.4 DQN is the 2016 baseline

`Effort M` `Impact medium`

- **Now.** Uniform replay ([`src/rl/replay.ts`](../src/rl/replay.ts)), one-step targets (Eq. 5.2), a plain Q head and a hard target copy. The only addition to Mnih et al. (2015) is the Double DQN target.
- **Why it matters.** Rewards such as a Pong point or a Snake meal are sparse relative to the per-step shaping terms. Uniform sampling replays them rarely and one-step targets propagate them slowly.
- **Change.** In order of expected gain per line of code: n-step returns, prioritized replay (Schaul et al., 2016), a dueling head (Wang et al., 2016). Hessel et al. (2018) ablate these components and find multi-step targets and prioritisation the most important.
- **Evaluate.** Environment steps for DQN Pong to reach a mean return of 0 over 10 seeds, per added component, against the current agent.

### 11.5 PPO implementation details

`Effort M` `Impact medium`

- **Now.** The deviations listed at the end of Section 6: shared trunk, state-independent log standard deviation clamped to $[-2.5, 0.5]$, clipped actions scored as unclipped samples, constant learning rate, no value clipping, the 0.01 output scale applied to the value output as well, and no entropy bonus for continuous actions.
- **Why it matters.** Engstrom et al. (2020) show that such "code-level" choices explain much of PPO's reported performance. Andrychowicz et al. (2021) test more than 50 of them and recommend, among others, separate policy and value networks. None of EvoLab's choices was ablated.
- **Change.** Make each choice a config flag in [`src/learner/config.ts`](../src/learner/config.ts) and run a one-at-a-time ablation. Start with separate networks and learning-rate annealing, which are the cheapest.
- **Evaluate.** PPO on the car and the walker, final mean return and its interval over 10 seeds at a fixed step budget, per flag.

### 11.6 Shaping changes the task

`Effort S` `Impact medium`

- **Now.** Fitness is Eq. 3.1 with arbitrary counters. The default presets pay for proxies: paddle tracking in Pong, speed in the car, upright seconds in the walker. No chart shows the task outcome on its own.
- **Why it matters.** Outside the potential-based form of Eq. 3.3 the shaped optimum can differ from the task optimum (Ng, Harada and Russell, 1999). A rising fitness curve may be a rising proxy. The benchmark notes record one instance: the walker first passed its benchmark by hopping.
- **Change.** Mark one term per concept as the task metric (points won, laps, metres, lines) and always plot it unweighted beside the fitness. Optionally offer potential-based variants of the distance-like terms.
- **Evaluate.** Rank correlation between fitness and the task metric across champions of a run. A low value flags a preset that teaches the proxy.

### 11.7 The speciation controller is untested

`Effort S` `Impact low to medium`

- **Now.** Eq. 4.2 moves the threshold by a fixed 0.15 toward 8 species, for populations from 60 to 150 and initial genomes from 6 connection genes (Tetris) to 126 (the walker). Assignment is first-fit against a random representative ([`src/neat/species.ts`](../src/neat/species.ts)).
- **Why it matters.** The paper's argument for speciation is that it protects structural innovation (Stanley and Miikkulainen, 2002). A controller that merges and splits species to hit a count changes what is protected, and a target of 8 gives the walker species of 7 or 8 genomes, with 2 parents each at a 20% survival rate.
- **Change.** Compare three settings: the fixed threshold of the paper, the current controller, and a controller whose target scales with $N$.
- **Evaluate.** Final best fitness over 10 seeds, and the number of generations a new hidden node survives before its species is removed, which measures the protection directly.

### 11.8 Objective-only search on a deceptive task

`Effort L` `Impact uncertain`

- **Now.** Selection uses fitness only. The walker's reward is forward distance plus upright time, and its policy is a direct encoding with one gene per connection.
- **Why it matters.** Locomotion is the standard example of a deceptive objective: lunging forward scores well early and leads away from walking. Lehman and Stanley (2011) show that rewarding behavioural novelty can outperform the objective on such tasks, including biped walking. A biped is also left-right symmetric, which a direct encoding has to discover twice.
- **Change.** Add novelty search with a behaviour descriptor such as the torso trajectory sampled once per second, alone or mixed with fitness. A larger step is an indirect encoding such as HyperNEAT (Stanley, D'Ambrosio and Gauci, 2009), which can express the symmetry in one pattern.
- **Evaluate.** Distance walked by the champion after a fixed number of evaluations, over 10 seeds, and the fraction of seeds whose champion alternates its feet.

### 11.9 Noisy fitness and elitism

`Effort S` `Impact medium`

- **Now.** Most concepts evaluate each genome on 1 episode (Section 4.6). The episode seed changes every generation, so in a concept that uses its seed the "unchanged" elite is scored on a new episode and the best-fitness curve can fall. The walker is the exception: it ignores its seed, so its elite scores the same every generation. The car's seed only selects one of 8 start positions (Section 2). The generated Dodge module shows the noisy case: best fitness swings between about 13 and 2 for 120 generations.
- **Why it matters.** A record on the chart can be a lucky episode, and the NEAT verdict (Section 8) is a function of records only. Selection on one noisy sample also favours variance.
- **Change.** Re-evaluate the top few genomes on a fixed set of held-out seeds each generation and draw that score as the record. Raising `episodesPerGenome` is the blunt alternative and multiplies the cost.
- **Evaluate.** The gap between the training fitness of each generation's champion and its mean score on 20 held-out seeds. That gap is the selection bias the chart currently hides.

### 11.10 Power of the learnability check

`Effort M` `Impact medium`

- **Now.** Fixed sample sizes of 64 and 32, a fixed seed and hand-set thresholds (Section 9). By Eq. 9.1 a ceiling that random play reaches in 1% of episodes is detected less than half the time. Fixed-length episodes are exempt by construction, as the source comment says.
- **Why it matters.** A module that passes and then shows a flat chart is the worst outcome for the reader: it looks like the learner failed.
- **Change.** Replace the survival count with a short learning probe: 10 generations of NEAT at a small population, accept when the best fitness improves by a margin relative to the spread of random play. Calibrate the margin on a labelled set of modules, which the trial folder already starts.
- **Evaluate.** Precision and recall of accept or reject against the label "improves over 30 generations" on a set of at least 50 generated modules.

### 11.11 Generated games plateau early

`Effort M` `Impact high for the generator`

- **Now.** Two of the five validated modules in the recorded trial sit at their reward ceiling within 10 generations (Section 10). The prompt asks for ramping difficulty. Nothing measures whether it was delivered.
- **Why it matters.** The product promise is "describe a game and watch it being learned". A game solved in generation 1 has nothing to watch.
- **Change.** Have the contract expose a difficulty parameter, and reject or repair a module whose probe run (11.10) saturates. Report headroom, $(F_{30} - F_1) / (F_{\max} - F_1)$, in the trial table.
- **Evaluate.** The share of validated modules with headroom above a chosen threshold, before and after, on the same prompts and at least 3 models. Seeds as in 11.1.

## 12. References

1. Agarwal, R., Schwarzer, M., Castro, P. S., Courville, A. and Bellemare, M. G. (2021). Deep reinforcement learning at the edge of the statistical precipice. *Advances in Neural Information Processing Systems 34*. [arXiv:2108.13264](https://arxiv.org/abs/2108.13264)
2. Andrychowicz, M., Raichuk, A., Stanczyk, P., Orsini, M., Girgin, S., Marinier, R., Hussenot, L., Geist, M., Pietquin, O., Michalski, M., Gelly, S. and Bachem, O. (2021). What matters in on-policy reinforcement learning? A large-scale empirical study. *International Conference on Learning Representations*. [arXiv:2006.05990](https://arxiv.org/abs/2006.05990)
3. Engstrom, L., Ilyas, A., Santurkar, S., Tsipras, D., Janoos, F., Rudolph, L. and Madry, A. (2020). Implementation matters in deep policy gradients: a case study on PPO and TRPO. *International Conference on Learning Representations*. [arXiv:2005.12729](https://arxiv.org/abs/2005.12729)
4. Henderson, P., Islam, R., Bachman, P., Pineau, J., Precup, D. and Meger, D. (2018). Deep reinforcement learning that matters. *AAAI Conference on Artificial Intelligence*. [arXiv:1709.06560](https://arxiv.org/abs/1709.06560)
5. Hessel, M., Modayil, J., van Hasselt, H., Schaul, T., Ostrovski, G., Dabney, W., Horgan, D., Piot, B., Azar, M. and Silver, D. (2018). Rainbow: combining improvements in deep reinforcement learning. *AAAI Conference on Artificial Intelligence*. [arXiv:1710.02298](https://arxiv.org/abs/1710.02298)
6. Huber, P. J. (1964). Robust estimation of a location parameter. *The Annals of Mathematical Statistics*, 35(1), 73-101. [doi:10.1214/aoms/1177703732](https://doi.org/10.1214/aoms/1177703732)
7. Kingma, D. P. and Ba, J. (2015). Adam: a method for stochastic optimization. *International Conference on Learning Representations*. [arXiv:1412.6980](https://arxiv.org/abs/1412.6980)
8. Lehman, J. and Stanley, K. O. (2011). Abandoning objectives: evolution through the search for novelty alone. *Evolutionary Computation*, 19(2), 189-223. [doi:10.1162/EVCO_a_00025](https://doi.org/10.1162/EVCO_a_00025)
9. Mnih, V., Kavukcuoglu, K., Silver, D., Rusu, A. A., Veness, J., Bellemare, M. G., Graves, A., Riedmiller, M., Fidjeland, A. K., Ostrovski, G. and others (2015). Human-level control through deep reinforcement learning. *Nature*, 518, 529-533. [doi:10.1038/nature14236](https://doi.org/10.1038/nature14236)
10. Ng, A. Y., Harada, D. and Russell, S. (1999). Policy invariance under reward transformations: theory and application to reward shaping. *International Conference on Machine Learning*, 278-287.
11. Pardo, F., Tavakoli, A., Levdik, V. and Kormushev, P. (2018). Time limits in reinforcement learning. *International Conference on Machine Learning*. [arXiv:1712.00378](https://arxiv.org/abs/1712.00378)
12. Schaul, T., Quan, J., Antonoglou, I. and Silver, D. (2016). Prioritized experience replay. *International Conference on Learning Representations*. [arXiv:1511.05952](https://arxiv.org/abs/1511.05952)
13. Schulman, J., Moritz, P., Levine, S., Jordan, M. and Abbeel, P. (2016). High-dimensional continuous control using generalized advantage estimation. *International Conference on Learning Representations*. [arXiv:1506.02438](https://arxiv.org/abs/1506.02438)
14. Schulman, J., Wolski, F., Dhariwal, P., Radford, A. and Klimov, O. (2017). Proximal policy optimization algorithms. [arXiv:1707.06347](https://arxiv.org/abs/1707.06347)
15. Stanley, K. O., D'Ambrosio, D. B. and Gauci, J. (2009). A hypercube-based encoding for evolving large-scale neural networks. *Artificial Life*, 15(2), 185-212. [doi:10.1162/artl.2009.15.2.15202](https://doi.org/10.1162/artl.2009.15.2.15202)
16. Stanley, K. O. and Miikkulainen, R. (2002). Evolving neural networks through augmenting topologies. *Evolutionary Computation*, 10(2), 99-127. [doi:10.1162/106365602320169811](https://doi.org/10.1162/106365602320169811)
17. van Hasselt, H., Guez, A. and Silver, D. (2016). Deep reinforcement learning with double Q-learning. *AAAI Conference on Artificial Intelligence*. [arXiv:1509.06461](https://arxiv.org/abs/1509.06461)
18. Wang, Z., Schaul, T., Hessel, M., van Hasselt, H., Lanctot, M. and de Freitas, N. (2016). Dueling network architectures for deep reinforcement learning. *International Conference on Machine Learning*. [arXiv:1511.06581](https://arxiv.org/abs/1511.06581)

**Inspiration, not sources.** [Code Bullet](https://www.youtube.com/@CodeBullet) made the "AI learns to play" videos that started this project, and [ml-visualized.com](https://ml-visualized.com/) inspired drawing the network while it learns. Neither is cited for a claim above.
