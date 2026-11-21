/** Arrays are time-major: index = t * nEnvs + e. ends: 0 = episode continues, 1 = terminated, 2 = truncated (bootstrap from boot[t*nEnvs+e]). */
export function computeGae(
  T: number, nEnvs: number, rewards: Float32Array, values: Float32Array, ends: Uint8Array, boot: Float32Array,
  lastValues: Float32Array, gamma: number, lambda: number, adv: Float32Array, ret: Float32Array,
): void {
  for (let e = 0; e < nEnvs; e++) {
    let gae = 0;
    for (let t = T - 1; t >= 0; t--) {
      const i = t * nEnvs + e, end = ends[i]!;
      const nextV = end === 1 ? 0 : end === 2 ? boot[i]! : t === T - 1 ? lastValues[e]! : values[i + nEnvs]!;
      const delta = rewards[i]! + gamma * nextV - values[i]!;
      gae = delta + (end === 0 ? gamma * lambda * gae : 0);
      adv[i] = gae; ret[i] = gae + values[i]!;
    }
  }
}
