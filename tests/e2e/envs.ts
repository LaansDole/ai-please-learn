/**
 * One row per built-in concept for the parameterised journey. `key` is a control of the env and `term` a reward term whose raw
 * counter rises while that key is held. Populations are NEAT's; timeouts bound the first three generations at MAX.
 */
export interface JourneyEnv { id: string; name: string; key: string; term: string; dims: '2d' | '3d'; population: number; timeout: number }

export const JOURNEY_ENVS: JourneyEnv[] = [
  { id: 'pong', name: 'Pong', key: 'ArrowUp', term: 'jitter', dims: '2d', population: 150, timeout: 60000 },
  { id: 'snake', name: 'Snake', key: 'ArrowUp', term: 'survive', dims: '2d', population: 150, timeout: 60000 },
  { id: 'flappy', name: 'Flappy', key: 'Space', term: 'alive', dims: '2d', population: 150, timeout: 60000 },
  { id: 'car', name: 'Car racing', key: 'ArrowUp', term: 'speed', dims: '2d', population: 150, timeout: 60000 },
  { id: 'tetris', name: 'Tetris', key: 'Space', term: 'piece', dims: '2d', population: 150, timeout: 120000 },
  { id: 'walker', name: 'Walker 3D', key: 'KeyD', term: 'energy', dims: '3d', population: 40, timeout: 180000 },
];
