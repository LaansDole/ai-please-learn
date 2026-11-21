import { registerEnv } from '../env/registry';
import { reach1d } from './reach1d';

let registered = false;

/** Registers every built-in environment. Safe to call more than once. */
export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
  registerEnv(reach1d);
}
