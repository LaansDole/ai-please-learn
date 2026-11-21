import { it } from 'vitest';
import { pong } from '../../src/envs/pong';
import { benchNeat } from './helpers';

it('NEAT learns Pong', async () => { await benchNeat(pong, { iterations: 30, margin: 8, budgetMs: 120000 }); });
