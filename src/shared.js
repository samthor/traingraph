
import { TrainGame } from './game.js';

export const sharedGame = new TrainGame({
  roundingFactor: 10,
  trainLength: 3,
  moveBy: 1,
  stepEvery: 20,
});

// @ts-ignore
window.sharedGame = sharedGame;