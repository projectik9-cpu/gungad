import { parseCard, RANKS } from './cards.js';

export const CAT = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
};

export const CAT_NAME_EN = {
  0: 'High Card',
  1: 'Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
};

export const CAT_NAME_RU = {
  0: 'Старшая карта',
  1: 'Пара',
  2: 'Две пары',
  3: 'Сет',
  4: 'Стрит',
  5: 'Флеш',
  6: 'Фулл-хаус',
  7: 'Каре',
  8: 'Стрит-флеш',
};

const RANK_NAME = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_NAME_RU = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'валет', 'дама', 'король', 'туз'];

function combos(arr, k) {
  const out = [];
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  const pick = () => idx.map((i) => arr[i]);
  if (k > n || k <= 0) return out;
  out.push(pick());
  while (true) {
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i -= 1;
    if (i < 0) break;
    idx[i] += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
    out.push(pick());
  }
  return out;
}

function findStraightHigh(ranksDescUnique) {
  const set = new Set(ranksDescUnique);
  if (set.has(12)) set.add(-1); // wheel: Ace as 1
  const uniq = [...set].sort((a, b) => b - a);
  for (let i = 0; i <= uniq.length - 5; i += 1) {
    const hi = uniq[i];
    let ok = true;
    for (let s = 1; s < 5; s += 1) {
      if (uniq[i + s] !== hi - s) {
        ok = false;
        break;
      }
    }
    if (ok) return hi === 3 && uniq.includes(-1) ? 3 : hi; // 5-high wheel
  }
  return -1;
}

/** Encode comparable 5-card hand: [category, kicker0, kicker1, ...] */
export function evalFive(codes) {
  const cards = codes.map(parseCard);
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = suits.every((s) => s === suits[0]);
  const uniqueRanks = [...new Set(ranks)];
  const straightHi = findStraightHigh(uniqueRanks);

  if (isFlush && straightHi >= 0) return [CAT.STRAIGHT_FLUSH, straightHi];
  if (groups[0][1] === 4) return [CAT.QUADS, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) return [CAT.FULL_HOUSE, groups[0][0], groups[1][0]];
  if (isFlush) return [CAT.FLUSH, ...ranks];
  if (straightHi >= 0) return [CAT.STRAIGHT, straightHi];
  if (groups[0][1] === 3) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]);
    return [CAT.TRIPS, groups[0][0], ...kickers];
  }
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    return [CAT.TWO_PAIR, pairs[0], pairs[1], kicker];
  }
  if (groups[0][1] === 2) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]);
    return [CAT.PAIR, groups[0][0], ...kickers];
  }
  return [CAT.HIGH, ...ranks];
}

export function compareRanks(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const da = a[i] ?? -1;
    const db = b[i] ?? -1;
    if (da !== db) return da - db;
  }
  return 0;
}

export function evalSeven(codes) {
  if (codes.length < 5) throw new Error('Need at least 5 cards');
  if (codes.length === 5) {
    const r = evalFive(codes);
    return { rank: r, best: codes.slice() };
  }
  let best = null;
  let bestCards = null;
  for (const five of combos(codes, 5)) {
    const r = evalFive(five);
    if (!best || compareRanks(r, best) > 0) {
      best = r;
      bestCards = five;
    }
  }
  return { rank: best, best: bestCards };
}

export function describeHand(rank, lang = 'en') {
  const cat = rank[0];
  const names = lang === 'ru' ? CAT_NAME_RU : CAT_NAME_EN;
  const rn = lang === 'ru' ? RANK_NAME_RU : RANK_NAME;
  const catName = names[cat] || 'Hand';
  if (cat === CAT.STRAIGHT_FLUSH && rank[1] === 12) {
    return lang === 'ru' ? 'Роял-флеш' : 'Royal Flush';
  }
  if (cat === CAT.STRAIGHT_FLUSH || cat === CAT.STRAIGHT) {
    return `${catName}, ${rn[rank[1]]}-high`;
  }
  if (cat === CAT.QUADS) return `${catName}, ${rn[rank[1]]}s`;
  if (cat === CAT.FULL_HOUSE) return `${catName}, ${rn[rank[1]]}s full of ${rn[rank[2]]}s`;
  if (cat === CAT.FLUSH || cat === CAT.HIGH) return `${catName}, ${rn[rank[1]]}`;
  if (cat === CAT.TRIPS || cat === CAT.PAIR) return `${catName}, ${rn[rank[1]]}s`;
  if (cat === CAT.TWO_PAIR) return `${catName}, ${rn[rank[1]]}s and ${rn[rank[2]]}s`;
  return catName;
}

export function rankToKey(rank) {
  return rank.join('-');
}

void RANKS;
