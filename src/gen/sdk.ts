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
    colors: Object.freeze({ bg: '#0d121b', fg: '#d7e0ee', dim: '#2a3446', accent: '#4de1c1', good: '#82d173', bad: '#ff5d73', warn: '#ffc857' }),
    W: 800, H: 500,
  });
}
