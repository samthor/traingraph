
import { TrainGame } from './game.js';

export const sharedGame = new TrainGame({
  roundingFactor: 100_000,
  trainLength: 10_000,
  moveBy: 400,
  stepEvery: 1,
});

// @ts-ignore
window.sharedGame = sharedGame;