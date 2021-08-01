
import { TrainGame } from './game.js';

export const sharedGame = new TrainGame(10);

// @ts-ignore
window.sharedGame = sharedGame;