import { describe, expect, it } from 'vitest';
import { car } from '../envs/car/car';
import { flappy } from '../envs/flappy';
import { pong } from '../envs/pong';
import { reach1d } from '../envs/reach1d';
import { snake } from '../envs/snake';
import { tetris } from '../envs/tetris/tetris';
import { walker } from '../envs/walker/walker';
import { checkLearnability } from './conformance';
import { prepareEnv } from './registry';

describe('learnability check', () => {
  it.each([reach1d, pong, snake, flappy, car, tetris, walker].map((d) => [d.meta.id, d] as const))('passes the built-in %s', async (_id, def) => {
    await prepareEnv(def);
    expect(checkLearnability(def)).toEqual([]);
  });
  it('is deterministic', () => {
    expect(checkLearnability(pong)).toEqual(checkLearnability(pong));
  });
});
