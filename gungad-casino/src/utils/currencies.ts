import { Currency, CurrencyConfig } from '../types';

/**
 * rateToUSD = how many units of this currency equal 1 USD
 * (e.g. RUB ~90 means $1 ≈ ₽90). Wallet balance is always USD cents.
 */
export const CURRENCIES: Record<Currency, CurrencyConfig> = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    flag: '🇺🇸',
    rateToUSD: 1.0,
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    flag: '🇪🇺',
    rateToUSD: 0.92,
  },
  RUB: {
    code: 'RUB',
    symbol: '₽',
    name: 'Российский рубль',
    flag: '🇷🇺',
    rateToUSD: 90,
  },
  UAH: {
    code: 'UAH',
    symbol: '₴',
    name: 'Українська гривня',
    flag: '🇺🇦',
    rateToUSD: 41.5,
  },
  KZT: {
    code: 'KZT',
    symbol: '₸',
    name: 'Қазақстан теңгесі',
    flag: '🇰🇿',
    rateToUSD: 510,
  },
  STARS: {
    code: 'STARS',
    symbol: '⭐',
    name: 'Telegram Stars',
    flag: '⭐',
    rateToUSD: 1,
  },
};

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

/** Apply live FX rates into CURRENCIES (mutates in place). */
export function setLiveRates(rates: Partial<Record<Currency, number>>): void {
  for (const code of Object.keys(CURRENCIES) as Currency[]) {
    if (code === 'STARS') continue;
    const v = rates[code];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      CURRENCIES[code].rateToUSD = v;
    }
  }
}

/**
 * Fetch live rates from backend; falls back to public CDN if API is down.
 * Returns the rates object or null on total failure.
 */
export async function fetchLiveRates(): Promise<Partial<Record<Currency, number>> | null> {
  try {
    const res = await fetch(`${API_BASE}/api/rates`);
    const json = await res.json();
    if (json?.ok && json.rates) {
      setLiveRates(json.rates);
      return json.rates as Partial<Record<Currency, number>>;
    }
  } catch {
    /* try CDN fallback */
  }

  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    );
    const json = await res.json();
    const u = json?.usd;
    if (u?.eur && u?.rub && u?.uah && u?.kzt) {
      const rates = {
        USD: 1,
        EUR: Number(u.eur),
        RUB: Number(u.rub),
        UAH: Number(u.uah),
        KZT: Number(u.kzt),
      };
      setLiveRates(rates);
      return rates;
    }
  } catch {
    /* keep hardcoded fallbacks */
  }
  return null;
}

export function convertUSDToCurrency(amountUSD: number, targetCurrency: Currency): number {
  if (targetCurrency === 'STARS') return amountUSD;
  const config = CURRENCIES[targetCurrency];
  return amountUSD * config.rateToUSD;
}

export function convertCurrencyToUSD(amount: number, fromCurrency: Currency): number {
  if (fromCurrency === 'STARS') return amount;
  const config = CURRENCIES[fromCurrency];
  return amount / config.rateToUSD;
}

export function formatStars(stars: number, showSymbol = true): string {
  const n = Math.max(0, Math.round(Number(stars) || 0));
  const formatted = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return showSymbol ? `⭐ ${formatted}` : formatted;
}

export function formatCurrency(amountUSD: number, currency: Currency, showSymbol = true): string {
  // Game/fiat amounts stay in money. Stars is a separate wallet (see formatStars).
  if (currency === 'STARS') {
    return formatCurrency(amountUSD, 'USD', showSymbol);
  }
  const converted = convertUSDToCurrency(amountUSD, currency);
  const config = CURRENCIES[currency];

  let decimals = 2;
  if (currency === 'RUB' || currency === 'KZT') {
    decimals = 0;
  }

  const formatted = converted.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return showSymbol ? `${config.symbol} ${formatted}` : formatted;
}
