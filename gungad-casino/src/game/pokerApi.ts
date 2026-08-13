const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

export function getInitData(): string | null {
  try {
    const early = (window as any).__GG_INIT_DATA;
    if (early && String(early).length > 10) return String(early);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && String(tg.initData).length > 10) return String(tg.initData);
  } catch {
    /* ignore */
  }
  return null;
}

export function formatChips(cents: number): string {
  const n = Number(cents) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

export async function pokerFetch(path: string, body: Record<string, unknown>) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE}/api/poker${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !json.ok) {
    const err = new Error(json.error || 'Poker request failed') as Error & { code?: string };
    err.code = json.code;
    throw err;
  }
  return json;
}

export const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_LABEL: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};

export function parsePokerCard(code: string | null | undefined) {
  if (!code || code === 'back' || code === 'xx') return null;
  const rank = code[0];
  const suit = code[1];
  return {
    code,
    rank: RANK_LABEL[rank] || rank,
    suit: SUIT_GLYPH[suit] || suit,
    red: suit === 'h' || suit === 'd',
  };
}
