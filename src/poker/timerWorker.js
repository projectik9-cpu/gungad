import logger from '../utils/logger.js';
import { processDueTables } from './tableService.js';

const TICK_MS = 400;
let timer = null;

export function startPokerTimerWorker() {
  if (timer) return;
  logger.info('[poker] timer worker started');
  const tick = async () => {
    try {
      await processDueTables();
    } catch (err) {
      logger.warn('[poker] timer tick: %s', err?.message || err);
    }
  };
  void tick();
  timer = setInterval(tick, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopPokerTimerWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
