import { it } from 'vitest';
import { snake } from '../../src/envs/snake';
import { benchNeat } from './helpers';

it('NEAT learns Snake', async () => { await benchNeat(snake, { iterations: 40, margin: 40, budgetMs: 120000 }); });
