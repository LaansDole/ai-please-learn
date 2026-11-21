import { it } from 'vitest';
import { car } from '../../src/envs/car/car';
import { benchNeat } from './helpers';

it('NEAT learns Car', async () => { await benchNeat(car, { iterations: 30, margin: 20, budgetMs: 180000 }); });
