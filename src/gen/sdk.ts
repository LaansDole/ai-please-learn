import { clamp, lerp, vec } from '../core/math';
import { Rng } from '../core/rng';

/** What generated modules receive as `sdk` (spec section 12.3). */
export interface GeneratedSdk {
  rng(seed: number): Pick<Rng, 'next' | 'range' | 'int' | 'gaussian' | 'pick'>;
  clamp: typeof clamp;
  lerp: typeof lerp;
  vec: typeof vec;
  colors: { bg: string; fg: string; dim: string; accent: string; good: string; bad: string; warn: string };
  W: 800;
  H: 500;
}

export function makeSdk(): GeneratedSdk {
  return Object.freeze({
    rng: (seed: number) => new Rng(seed),
    clamp, lerp,
    vec: Object.freeze({ ...vec }),
    colors: Object.freeze({ bg: '#f9faf5', fg: '#16241d', dim: '#c2cabb', accent: '#1b4f9c', good: '#1d6b4f', bad: '#a8442a', warn: '#d2a53c' }),
    W: 800, H: 500,
  });
}
