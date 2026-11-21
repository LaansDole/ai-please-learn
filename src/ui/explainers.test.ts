import { describe, expect, it } from 'vitest';
import { car } from '../envs/car/car';
import { pong } from '../envs/pong';
import { tetris } from '../envs/tetris/tetris';
import { compatibility, EXPLAINERS } from './explainers';

describe('learning-method explainers', () => {
  it('Car: NEAT and PPO are available, DQN is not because the actions are continuous', () => {
    const c = compatibility(car);
    expect(c.neat.ok).toBe(true); expect(c.ppo.ok).toBe(true); expect(c.dqn.ok).toBe(false);
    expect(c.dqn.reason).toContain('continuous');
  });
  it('Tetris: only NEAT can score candidate placements', () => {
    const c = compatibility(tetris);
    expect([c.neat.ok, c.dqn.ok, c.ppo.ok]).toEqual([true, false, false]);
    expect(c.dqn.reason).toContain('placement'); expect(c.ppo.reason).toContain('placements');
  });
  it('Pong: all three methods', () => {
    expect(Object.values(compatibility(pong)).every((c) => c.ok && c.reason === undefined)).toBe(true);
  });
  it('each explainer is one paragraph of 200 to 500 characters', () => {
    for (const { title, text } of Object.values(EXPLAINERS)) {
      expect(title.length).toBeGreaterThan(0);
      expect(text).not.toContain('\n');
      expect(text.length).toBeGreaterThanOrEqual(200); expect(text.length).toBeLessThanOrEqual(500);
    }
  });
});
