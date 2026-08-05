import { simulateRtp } from '../gungad-casino/src/game/slots/crimsonEngine';

const N = Number(process.argv[2] || 200_000);
console.log(`Simulating ${N.toLocaleString()} spins...`);
const t0 = Date.now();
const res = simulateRtp(N);
const ms = Date.now() - t0;
console.log({
  rtp: res.rtp,
  rtpPct: `${(res.rtp * 100).toFixed(2)}%`,
  hitPct: `${(res.hitRate * 100).toFixed(2)}%`,
  fsPct: `${(res.fsRate * 100).toFixed(2)}%`,
  avgWin: res.avgWin,
  ms,
  spinsPerSec: Math.round(N / (ms / 1000)),
});
