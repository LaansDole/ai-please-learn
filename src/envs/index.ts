import { registerEnv } from '../env/registry';
import { car } from './car/car';
import { flappy } from './flappy';
import { pong } from './pong';
import { reach1d } from './reach1d';
import { snake } from './snake';

let registered = false;

/** Registers every built-in environment. Safe to call more than once. */
export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
  registerEnv(reach1d);
  registerEnv(pong);
  registerEnv(snake);
  registerEnv(flappy);
  registerEnv(car);
}
