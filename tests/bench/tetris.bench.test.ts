import { it } from 'vitest';
import { tetris } from '../../src/envs/tetris/tetris';
import { benchNeat } from './helpers';

it('NEAT learns Tetris', async () => { await benchNeat(tetris, { iterations: 15, margin: 300, budgetMs: 180000 }); });
