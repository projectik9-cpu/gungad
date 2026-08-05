import { simulateRtp, simulateBuyBonus } from '../gungad-casino/src/game/slots/crimsonEngine';

const mode = process.argv[2] === 'buy' ? 'buy' : 'base';
const N = Number(process.argv[3] || (mode === 'buy' ? 50_000 : 200_000));

if (mode === 'buy') {
  console.log(`Simulating ${N.toLocaleString()} buy-bonus purchases...`);
  const t0 = Date.now();
  const res = simulateBuyBonus(N);
  const ms = Date.now() - t0;
  console.log({
    meanReturnPct: `${(res.meanReturn * 100).toFixed(2)}%`,
    meanReturn: res.meanReturn,
    medianMultOfBet: res.medianMult,
    avgPayout: res.avgPayout,
    cost: res.cost,
    ms,
  });
} else {
  console.log(`Simulating ${N.toLocaleString()} base spins...`);
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
}
