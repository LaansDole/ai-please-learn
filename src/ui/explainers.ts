import type { EnvSpecMsg, LearnerKind } from '../env/types';

/** Texts: spec section 8.4. */
export const EXPLAINERS: Record<LearnerKind, { title: string; text: string }> = {
  neat: {
    title: 'NEAT: evolve a population',
    text: 'Starts with a crowd of tiny random brains. Each one plays. The best are kept, bred and mutated. Mutations can add neurons and wires, so the brain itself grows over generations. No gradients: just survival.',
  },
  dqn: {
    title: 'DQN: learn from memories',
    text: "One brain learns from its own memories. It plays, stores every moment in a replay buffer, and repeatedly nudges its estimate of 'how good is each action here' toward what actually happened next. Starts by acting randomly (epsilon) and gradually trusts itself. Works for games with a few distinct buttons.",
  },
  ppo: {
    title: 'PPO: small careful steps',
    text: 'One brain plays several copies of the game at once, then looks back over the batch and adjusts itself to make the better-than-expected actions more likely, in small careful steps so it never forgets what it knew. Works for buttons and for smooth controls like steering or joint motors.',
  },
};

/** Which methods can learn this concept, with a plain-language reason when one cannot. */
export function compatibility(spec: Pick<EnvSpecMsg, 'meta' | 'action'>): Record<LearnerKind, { ok: boolean; reason?: string }> {
  const type = spec.action.type;
  const check = (kind: LearnerKind): { ok: boolean; reason?: string } => {
    if (kind === 'dqn' && type !== 'discrete') {
      return { ok: false, reason: `DQN needs a small set of distinct actions. This concept uses ${type === 'continuous' ? 'continuous dials' : 'placement scoring'}.` };
    }
    if (kind === 'ppo' && type === 'candidates') return { ok: false, reason: 'PPO cannot score candidate placements.' };
    return spec.meta.learners.includes(kind) ? { ok: true } : { ok: false, reason: 'Not available for this concept.' };
  };
  return { neat: check('neat'), dqn: check('dqn'), ppo: check('ppo') };
}
