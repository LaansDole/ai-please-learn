import { it } from 'vitest';
import { flappy } from '../../src/envs/flappy';
import { benchNeat } from './helpers';

it('NEAT learns Flappy', async () => { await benchNeat(flappy, { iterations: 40, margin: 100, budgetMs: 120000 }); });
