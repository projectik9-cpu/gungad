import { Currency, CurrencyConfig } from '../types';

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
    rateToUSD: 89.5,
  },
  UAH: {
    code: 'UAH',
    symbol: '₴',
    name: 'Українська гривня',
    flag: '🇺🇦',
    rateToUSD: 41.2,
  },
  KZT: {
    code: 'KZT',
    symbol: '₸',
    name: 'Қазақстан теңгесі',
    flag: '🇰🇿',
    rateToUSD: 485.0,
  },
};

export function convertUSDToCurrency(amountUSD: number, targetCurrency: Currency): number {
  const config = CURRENCIES[targetCurrency];
  return amountUSD * config.rateToUSD;
}

export function convertCurrencyToUSD(amount: number, fromCurrency: Currency): number {
  const config = CURRENCIES[fromCurrency];
  return amount / config.rateToUSD;
}

export function formatCurrency(amountUSD: number, currency: Currency, showSymbol = true): string {
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
