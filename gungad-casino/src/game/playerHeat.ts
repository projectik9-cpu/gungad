/** First bets of a new session are forced wins so the player enters the game. */

export const WARMUP_BETS = 3;

const STORAGE_PREFIX = 'gg_warmup_count:';

let profileKey = 'anon';

export function setHeatProfileId(id: string | null): void {
  profileKey = id && id.length > 0 ? id : 'anon';
}

function storageKey(): string {
  return STORAGE_PREFIX + profileKey;
}

function readCount(): number {
  try {
    const n = parseInt(sessionStorage.getItem(storageKey()) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCount(n: number): void {
  try {
    sessionStorage.setItem(storageKey(), String(n));
  } catch {
    /* private mode / quota */
  }
}

export function isWarmupActive(): boolean {
  return readCount() < WARMUP_BETS;
}

/** Consume one warmup slot at stake time. Returns true if this bet must win. */
export function consumeWarmupBet(): boolean {
  if (!isWarmupActive()) return false;
  writeCount(readCount() + 1);
  return true;
}
