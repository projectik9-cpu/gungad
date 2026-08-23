import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('logs');
const FILES = ['messages.html', 'messages2.html'].map((f) => path.join(ROOT, f));

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function parseUsd(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, '').match(/-?\$?([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  const neg = String(s).includes('-') && !String(s).match(/Профит: \$-/) ? String(s).trim().startsWith('-') || /Профит: -/.test(String(s)) : String(s).includes('-$') || /Профит: -\s*\$/.test(String(s));
  if (String(s).includes('-$') || /Профит:\s*-/.test(String(s))) return -n;
  return n;
}

function parseProfit(s) {
  const m = String(s).match(/Профит:\s*(-)?\s*\$([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  return m[1] ? -Number(m[2]) : Number(m[2]);
}

function parseStake(s) {
  const m = String(s).match(/Ставка:\s*\$([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  return Number(m[1]);
}

function parsePayout(s) {
  const m = String(s).match(/Выплата:\s*\$([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  return Number(m[1]);
}

function parseMult(s) {
  const m = String(s).match(/Множитель:\s*([0-9]+(?:\.[0-9]+)?)x/i);
  if (!m) return null;
  return Number(m[1]);
}

function classify(text) {
  if (/КРУПНЫЙ ВЫИГРЫШ/.test(text) || /ВЫИГРЫШ/.test(text)) return 'win';
  if (/ПРОИГРЫШ/.test(text)) return 'loss';
  if (/ПУШ/.test(text)) return 'push';
  if (/СТАВКА ОТКРЫТА/.test(text)) return 'open';
  if (/ДЕПОЗИТ/.test(text) && !/STARS/.test(text)) return 'deposit';
  if (/ЗАЯВКА НА ВЫВОД/.test(text)) return 'withdraw_req';
  if (/ВЫВОД ВЫПЛАЧЕН/.test(text)) return 'withdraw_ok';
  if (/ВЫВОД ОТКЛОНЁН|ВЫВОД ОТКЛОНЕН/.test(text)) return 'withdraw_no';
  if (/БОНУС/.test(text)) return 'bonus';
  if (/ТИКЕТ/.test(text) || /Обращение в поддержку/.test(text)) return 'ticket';
  if (/СТАВКА/.test(text) && /Игра:/.test(text)) return 'bet';
  return 'other';
}

function parseMessage(htmlBlock, dateTitle) {
  const text = stripHtml(htmlBlock);
  const kind = classify(text);
  const gameM = text.match(/Игра:\s*([A-Z0-9_]+)/i);
  const statusM = text.match(/Статус:\s*([a-z_]+)/i);
  const playerM = text.match(/Игрок:\s*(@[A-Za-z0-9_]+|[^\n]+)/);
  const tgM = text.match(/TG ID:\s*(\d+)/) || text.match(/\((\d{6,})\)/);
  const betIdM = text.match(/Bet:\s*([0-9a-f-]{36})/i);
  return {
    kind,
    game: gameM ? gameM[1].toUpperCase() : null,
    status: statusM ? statusM[1] : null,
    player: playerM ? playerM[1].trim().split(/\s+/)[0] : null,
    tg: tgM ? tgM[1] : null,
    stake: parseStake(text),
    payout: parsePayout(text),
    profit: parseProfit(text),
    multiplier: parseMult(text),
    betId: betIdM ? betIdM[1] : null,
    date: dateTitle || null,
    raw: text.slice(0, 240),
  };
}

function extractMessages(html) {
  const out = [];
  const re = /<div class="message[^"]*"[^>]*id="message[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  // Simpler: split by message ids and take text + date title
  const chunks = html.split(/<div class="message /);
  for (const chunk of chunks.slice(1)) {
    const dateM = chunk.match(/title="([^"]+)"/);
    const textM = chunk.match(/<div class="text">([\s\S]*?)<\/div>/);
    if (!textM) continue;
    out.push(parseMessage(textM[1], dateM ? dateM[1] : null));
  }
  return out;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function avg(arr) {
  if (!arr.length) return 0;
  return sum(arr) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const messages = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  messages.push(...extractMessages(fs.readFileSync(f, 'utf8')));
}

const settled = messages.filter((m) => ['win', 'loss', 'push'].includes(m.kind) && m.game);
// Dedup by betId when present
const seen = new Set();
const unique = [];
let dup = 0;
for (const m of settled) {
  if (m.betId) {
    if (seen.has(m.betId)) {
      dup += 1;
      continue;
    }
    seen.add(m.betId);
  }
  unique.push(m);
}

const games = {};
for (const m of unique) {
  if (!games[m.game]) {
    games[m.game] = {
      game: m.game,
      n: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      stakes: [],
      payouts: [],
      profits: [],
      winProfits: [],
      lossProfits: [],
      multipliers: [],
      winMults: [],
      players: new Set(),
    };
  }
  const g = games[m.game];
  g.n += 1;
  if (m.kind === 'win') g.wins += 1;
  else if (m.kind === 'loss') g.losses += 1;
  else g.pushes += 1;
  if (m.stake != null) g.stakes.push(m.stake);
  if (m.payout != null) g.payouts.push(m.payout);
  if (m.profit != null) {
    g.profits.push(m.profit);
    if (m.kind === 'win') g.winProfits.push(m.profit);
    if (m.kind === 'loss') g.lossProfits.push(m.profit);
  }
  if (m.multiplier != null) {
    g.multipliers.push(m.multiplier);
    if (m.kind === 'win') g.winMults.push(m.multiplier);
  }
  if (m.player) g.players.add(m.player);
}

const gameRows = Object.values(games)
  .map((g) => {
    const wagered = sum(g.stakes);
    const paid = sum(g.payouts);
    const profitHouse = wagered - paid;
    const playerNet = sum(g.profits);
    const rtp = wagered ? paid / wagered : 0;
    return {
      game: g.game,
      n: g.n,
      wins: g.wins,
      losses: g.losses,
      pushes: g.pushes,
      winRate: pct(g.wins, g.n),
      lossRate: pct(g.losses, g.n),
      pushRate: pct(g.pushes, g.n),
      wagered: round2(wagered),
      paid: round2(paid),
      playerNet: round2(playerNet),
      house: round2(profitHouse),
      rtpPct: round2(rtp * 100),
      houseEdgePct: round2((1 - rtp) * 100),
      avgBet: round2(avg(g.stakes)),
      avgProfit: round2(avg(g.profits)),
      avgWin: round2(avg(g.winProfits)),
      avgLoss: round2(avg(g.lossProfits)),
      medMult: round2(median(g.multipliers)),
      medWinMult: round2(median(g.winMults)),
      maxMult: round2(Math.max(0, ...g.winMults)),
      players: g.players.size,
    };
  })
  .sort((a, b) => b.n - a.n);

const kinds = {};
for (const m of messages) kinds[m.kind] = (kinds[m.kind] || 0) + 1;

const dates = unique.map((m) => m.date).filter(Boolean);
const players = new Set(unique.map((m) => m.player).filter(Boolean));

const bigWins = unique
  .filter((m) => m.kind === 'win' && (m.profit || 0) >= 20)
  .sort((a, b) => (b.profit || 0) - (a.profit || 0))
  .slice(0, 15)
  .map((m) => ({
    game: m.game,
    player: m.player,
    stake: m.stake,
    payout: m.payout,
    profit: m.profit,
    mult: m.multiplier,
    date: m.date,
  }));

const byPlayer = {};
for (const m of unique) {
  const k = m.player || m.tg || 'unknown';
  if (!byPlayer[k]) byPlayer[k] = { player: k, n: 0, wagered: 0, net: 0, wins: 0, losses: 0 };
  byPlayer[k].n += 1;
  byPlayer[k].wagered += m.stake || 0;
  byPlayer[k].net += m.profit || 0;
  if (m.kind === 'win') byPlayer[k].wins += 1;
  if (m.kind === 'loss') byPlayer[k].losses += 1;
}
const topPlayers = Object.values(byPlayer)
  .sort((a, b) => b.wagered - a.wagered)
  .slice(0, 12)
  .map((p) => ({
    ...p,
    wagered: round2(p.wagered),
    net: round2(p.net),
    winRate: pct(p.wins, p.n),
  }));

const totals = {
  messages: messages.length,
  settled: unique.length,
  dupsSkipped: dup,
  wins: unique.filter((x) => x.kind === 'win').length,
  losses: unique.filter((x) => x.kind === 'loss').length,
  pushes: unique.filter((x) => x.kind === 'push').length,
  wagered: round2(sum(unique.map((x) => x.stake || 0))),
  paid: round2(sum(unique.map((x) => x.payout || 0))),
  playerNet: round2(sum(unique.map((x) => x.profit || 0))),
  players: players.size,
  kinds,
  dateMin: dates[0] || null,
  dateMax: dates[dates.length - 1] || null,
};
totals.rtpPct = totals.wagered ? round2((totals.paid / totals.wagered) * 100) : 0;
totals.house = round2(totals.wagered - totals.paid);
totals.winRate = pct(totals.wins, totals.settled);
totals.lossRate = pct(totals.losses, totals.settled);

const out = { totals, games: gameRows, bigWins, topPlayers };
fs.writeFileSync('scripts/channel-log-analytics.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
