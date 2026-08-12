/**
 * Shared “live” online: 100–150, same for every client at a given second.
 * Moscow time-of-day curve + slow waves + stepwise jitter (join/leave).
 */
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const MIN = 100;
const MAX = 150;

function hash01(n) {
  let x = Math.imul(n, 374761393) + 668265263;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function simulatedOnlineCount(nowMs = Date.now()) {
  const d = new Date(nowMs + MOSCOW_OFFSET_MS);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;

  const rad = ((h - 21) / 24) * 2 * Math.PI;
  const diurnal = (Math.cos(rad) + 1) / 2;
  const base = 112 + diurnal * 26;

  const t = nowMs / 1000;
  const slow = Math.sin(t / 487) * 5.4 + Math.sin(t / 791 + 1.7) * 3.6;
  const mid = Math.sin(t / 173 + 0.4) * 2.2;

  const step = Math.floor(nowMs / 11_000);
  const jitter = hash01(step) * 5 - 2.5;

  return Math.max(MIN, Math.min(MAX, Math.round(base + slow + mid + jitter)));
}
