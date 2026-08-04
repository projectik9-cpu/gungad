/**
 * Live FX rates (display only — wallet stays in USD cents).
 *
 * GET /api/rates
 *   Returns { ok, rates: { USD, EUR, RUB, UAH, KZT }, source, updated_at }
 *
 * Cached ~30 minutes. Sources (fallback chain):
 *   1) open.er-api.com
 *   2) fawazahmed0 currency-api (jsDelivr)
 */
import express from 'express';
import logger from '../../utils/logger.js';

const router = express.Router();

const TTL_MS = 30 * 60 * 1000;
const FALLBACK = {
  USD: 1,
  EUR: 0.92,
  RUB: 90,
  UAH: 41.5,
  KZT: 510,
};

let cache = {
  at: 0,
  rates: { ...FALLBACK },
  source: 'fallback',
};

async function fetchFromOpenErApi() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  const r = json?.rates;
  if (!r?.EUR || !r?.RUB || !r?.UAH || !r?.KZT) {
    throw new Error('open.er-api missing currencies');
  }
  return {
    rates: {
      USD: 1,
      EUR: Number(r.EUR),
      RUB: Number(r.RUB),
      UAH: Number(r.UAH),
      KZT: Number(r.KZT),
    },
    source: 'open.er-api.com',
  };
}

async function fetchFromJsDelivr() {
  const res = await fetch(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    { signal: AbortSignal.timeout(8000) },
  );
  const json = await res.json();
  const u = json?.usd;
  if (!u?.eur || !u?.rub || !u?.uah || !u?.kzt) {
    throw new Error('jsdelivr currency-api missing currencies');
  }
  return {
    rates: {
      USD: 1,
      EUR: Number(u.eur),
      RUB: Number(u.rub),
      UAH: Number(u.uah),
      KZT: Number(u.kzt),
    },
    source: 'fawazahmed0/currency-api',
  };
}

async function refreshRates() {
  const errors = [];
  for (const fn of [fetchFromOpenErApi, fetchFromJsDelivr]) {
    try {
      const { rates, source } = await fn();
      // sanity: all positive
      for (const [k, v] of Object.entries(rates)) {
        if (!Number.isFinite(v) || v <= 0) throw new Error(`bad rate ${k}=${v}`);
      }
      cache = { at: Date.now(), rates, source };
      logger.info(`[rates] refreshed via ${source}: EUR=${rates.EUR} RUB=${rates.RUB} UAH=${rates.UAH} KZT=${rates.KZT}`);
      return cache;
    } catch (e) {
      errors.push(e?.message || String(e));
    }
  }
  logger.warn(`[rates] all sources failed: ${errors.join(' | ')}`);
  return cache;
}

router.get('/', async (_req, res) => {
  try {
    if (Date.now() - cache.at > TTL_MS) {
      await refreshRates();
    }
    return res.json({
      ok: true,
      rates: cache.rates,
      source: cache.source,
      updated_at: cache.at ? new Date(cache.at).toISOString() : null,
    });
  } catch (err) {
    logger.error(`[rates] ${err?.message || err}`);
    return res.json({
      ok: true,
      rates: cache.rates,
      source: cache.source || 'fallback',
      updated_at: null,
    });
  }
});

// Warm cache on boot (non-blocking)
setTimeout(() => {
  refreshRates().catch(() => {});
}, 2000);

export default router;
