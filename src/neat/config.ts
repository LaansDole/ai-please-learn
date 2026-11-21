/** Keys and defaults: spec section 6.8. */
export interface NeatConfig {
  populationSize: number; episodesPerGenome: number;
  c1: number; c2: number; c3: number;
  compatThreshold: number; targetSpecies: number; thresholdStep: number; thresholdMin: number; smallGenomeN: number;
  survivalRate: number; elitismMinSpecies: number; stagnationGens: number; protectedSpecies: number;
  crossoverProb: number; interspeciesProb: number;
  pWeightMutate: number; pWeightReplace: number; weightSigma: number; weightInitSigma: number; weightClamp: number;
  pBiasMutate: number; biasSigma: number;
  pAddConn: number; pAddNode: number; pToggle: number; pInheritDisabled: number;
  addConnTries: number; maxHidden: number;
}

export const DEFAULT_NEAT: NeatConfig = {
  populationSize: 150, episodesPerGenome: 1,
  c1: 1.0, c2: 1.0, c3: 0.4,
  compatThreshold: 3.0, targetSpecies: 8, thresholdStep: 0.15, thresholdMin: 0.3, smallGenomeN: 20,
  survivalRate: 0.2, elitismMinSpecies: 5, stagnationGens: 15, protectedSpecies: 2,
  crossoverProb: 0.75, interspeciesProb: 0.001,
  pWeightMutate: 0.8, pWeightReplace: 0.1, weightSigma: 0.5, weightInitSigma: 1.0, weightClamp: 8,
  pBiasMutate: 0.3, biasSigma: 0.3,
  pAddConn: 0.10, pAddNode: 0.05, pToggle: 0.01, pInheritDisabled: 0.75,
  addConnTries: 20, maxHidden: 64,
};
