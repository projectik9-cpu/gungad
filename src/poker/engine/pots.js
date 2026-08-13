/**
 * Side-pot construction from per-player investment.
 * Folded players still contribute chips but cannot win the pot.
 */
export function buildPots(players) {
  // players: { seatNo, invested, folded }
  const contrib = players
    .filter((p) => p.invested > 0)
    .map((p) => ({ seatNo: p.seatNo, invested: p.invested, folded: !!p.folded }));

  if (!contrib.length) return [];

  const levels = [...new Set(contrib.map((p) => p.invested))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;

  for (const level of levels) {
    const layer = level - prev;
    if (layer <= 0) continue;
    let amount = 0;
    const eligible = [];
    for (const p of contrib) {
      if (p.invested >= level) {
        amount += layer;
        if (!p.folded) eligible.push(p.seatNo);
      } else if (p.invested > prev) {
        amount += p.invested - prev;
      }
    }
    if (amount > 0) {
      pots.push({ amount, eligibleSeats: eligible, cap: level });
    }
    prev = level;
  }

  return pots;
}

export function totalPot(pots) {
  return pots.reduce((s, p) => s + (p.amount || 0), 0);
}

/**
 * Take rake from pot amounts (mutates copy). No-flop-no-drop: caller decides rake=0.
 * Returns { pots, rake }.
 */
export function applyRake(pots, rakeBps, rakeCapCents) {
  const total = totalPot(pots);
  if (total <= 0 || !rakeBps) return { pots: pots.map((p) => ({ ...p })), rake: 0 };
  let rake = Math.floor((total * rakeBps) / 10_000);
  if (rakeCapCents > 0) rake = Math.min(rake, rakeCapCents);
  rake = Math.min(rake, total);
  if (rake <= 0) return { pots: pots.map((p) => ({ ...p })), rake: 0 };

  let remaining = rake;
  const next = pots.map((p) => ({ ...p, eligibleSeats: [...p.eligibleSeats] }));
  for (let i = next.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const take = Math.min(next[i].amount, remaining);
    next[i].amount -= take;
    remaining -= take;
  }
  return { pots: next.filter((p) => p.amount > 0 || p.eligibleSeats.length > 0), rake };
}

/**
 * Split a pot among winner seats. Odd chips go to seats in order after dealer.
 */
export function splitPot(amount, winners, dealerSeat, maxSeats) {
  if (!winners.length || amount <= 0) return {};
  const share = Math.floor(amount / winners.length);
  let odd = amount - share * winners.length;
  const awards = {};
  for (const s of winners) awards[s] = share;

  const order = [];
  for (let i = 1; i <= maxSeats; i += 1) {
    const seat = ((dealerSeat - 1 + i) % maxSeats) + 1;
    if (winners.includes(seat)) order.push(seat);
  }
  let idx = 0;
  while (odd > 0 && order.length) {
    awards[order[idx % order.length]] += 1;
    odd -= 1;
    idx += 1;
  }
  return awards;
}
