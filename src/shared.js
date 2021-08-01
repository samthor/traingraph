
import { TrainGame } from './game.js';

export const sharedGame = new TrainGame(1_000);

// @ts-ignore
window.sharedGame = sharedGame;