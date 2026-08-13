export function toCall(state, seat) {
  return Math.max(0, (state.currentBet || 0) - (seat.betThisStreet || 0));
}

export function minBetTo(state) {
  const bb = state.bbCents || 0;
  if ((state.currentBet || 0) <= 0) return bb;
  return state.currentBet + (state.minRaise || bb);
}

/**
 * amountCents for bet/raise is the total chips this street ("raise to").
 */
export function legalActions(state, seat) {
  if (!seat || seat.folded || seat.allIn || seat.sittingOut) return [];
  if (state.actorSeat !== seat.seatNo) return [];
  if (!['preflop', 'flop', 'turn', 'river'].includes(state.street)) return [];

  const call = toCall(state, seat);
  const stack = seat.stackCents || 0;
  const actions = [];

  if (call > 0) actions.push({ type: 'fold' });

  if (call === 0) {
    actions.push({ type: 'check' });
  } else if (stack <= call) {
    actions.push({ type: 'allin', amountCents: stack + (seat.betThisStreet || 0) });
    return actions;
  } else {
    actions.push({ type: 'call', amountCents: call });
  }

  const minTo = minBetTo(state);
  const maxTo = (seat.betThisStreet || 0) + stack;
  if (maxTo > (state.currentBet || 0) && stack > call) {
    const type = (state.currentBet || 0) <= 0 ? 'bet' : 'raise';
    actions.push({
      type,
      minCents: Math.min(minTo, maxTo),
      maxCents: maxTo,
    });
    actions.push({ type: 'allin', amountCents: maxTo });
  }

  return actions;
}

export function isLegal(state, seat, action) {
  const list = legalActions(state, seat);
  if (!list.some((a) => a.type === action.type)) return false;
  if (action.type === 'bet' || action.type === 'raise') {
    const spec = list.find((a) => a.type === action.type);
    const amt = Number(action.amountCents);
    if (!Number.isInteger(amt)) return false;
    if (amt < spec.minCents || amt > spec.maxCents) return false;
  }
  return true;
}
