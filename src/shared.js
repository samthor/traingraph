
import { TrainGame } from './game.js';

export const sharedGame = new TrainGame();

// @ts-ignore
window.sharedGame = sharedGame;