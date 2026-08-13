import crypto from 'crypto';

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};

export function makeDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) deck.push(`${r}${s}`);
  }
  return deck;
}

export function parseCard(code) {
  if (!code || code.length < 2) throw new Error(`Bad card: ${code}`);
  const r = RANKS.indexOf(code[0]);
  const s = SUITS.indexOf(code[1]);
  if (r < 0 || s < 0) throw new Error(`Bad card: ${code}`);
  return { code, rank: r, suit: s, rankChar: code[0], suitChar: code[1] };
}

export function formatCard(code) {
  const c = parseCard(code);
  return `${RANK_LABEL[c.rankChar]}${SUIT_GLYPH[c.suitChar]}`;
}

export function newServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

export function seedHash(seed) {
  return crypto.createHash('sha256').update(String(seed)).digest('hex');
}

/** HMAC-SHA256 Fisher–Yates shuffle. Deterministic for a given seed. */
export function shuffledDeck(seed) {
  const deck = makeDeck();
  let counter = 0;
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const buf = crypto.createHmac('sha256', String(seed)).update(String(counter)).digest();
    counter += 1;
    const rand = buf.readUInt32BE(0) / 0x100000000;
    const j = Math.floor(rand * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

export function draw(deck, n = 1) {
  if (deck.length < n) throw new Error('Deck exhausted');
  const cards = deck.splice(deck.length - n, n);
  return cards;
}
