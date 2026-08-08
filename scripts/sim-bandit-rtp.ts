/**
 * Quick Monte-Carlo RTP check for the one-armed bandit.
 * Run: npx tsx scripts/sim-bandit-rtp.ts
 */
import { estimateRtp } from '../gungad-casino/src/game/slots/banditEngine';

const N = 500_000;
const real = estimateRtp(N, false);
const demo = estimateRtp(N, true);
console.log(`spins=${N}`);
console.log(`real RTP ≈ ${(real * 100).toFixed(2)}%`);
console.log(`demo RTP ≈ ${(demo * 100).toFixed(2)}%`);
