import React, { useEffect, useRef, useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import confetti from 'canvas-confetti';
import { Layers, Shield, ShieldCheck } from 'lucide-react';
import { blackjackNaturalMult } from '../../game/demoOdds';
import { formatCurrency } from '../../utils/currencies';

interface BlackjackGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

interface Card {
  suit: '♠' | '♥' | '♦' | '♣';
  value: string;
  weight: number;
  visible: boolean;
}

const SUITS: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getRandomCard(visible = true): Card {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const val = VALUES[Math.floor(Math.random() * VALUES.length)];
  let weight = parseInt(val);
  if (['J', 'Q', 'K'].includes(val)) weight = 10;
  if (val === 'A') weight = 11;
  return { suit, value: val, weight, visible };
}

function calculateHandScore(cards: Card[]): number {
  const visible = cards.filter(c => c.visible);
  let score = visible.reduce((acc, c) => acc + c.weight, 0);
  let aces = visible.filter((c) => c.value === 'A').length;
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

function calculateFullScore(cards: Card[]): number {
  let score = cards.reduce((acc, c) => acc + c.weight, 0);
  let aces = cards.filter((c) => c.value === 'A').length;
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

const CardFace: React.FC<{ card: Card; animate?: boolean }> = ({ card, animate }) => {
  const isRed = ['♥', '♦'].includes(card.suit);
  if (!card.visible) {
    return (
      <div className={`w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 flex items-center justify-center bg-gradient-to-br from-rose-900 to-rose-950 border-rose-600 shadow-xl ${animate ? 'animate-deal-in' : ''}`}>
        <Layers className="w-5 h-5 text-rose-400/60" />
      </div>
    );
  }
  return (
    <div className={`w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 bg-zinc-100 border-zinc-300 flex flex-col justify-between p-1.5 shadow-xl ${animate ? 'animate-deal-in' : ''}`}>
      <span className={`text-xs font-black ${isRed ? 'text-rose-600' : 'text-zinc-900'}`}>{card.value}</span>
      <span className={`text-lg md:text-xl text-center font-bold ${isRed ? 'text-rose-600' : 'text-zinc-900'}`}>{card.suit}</span>
      <span className={`text-xs font-black text-right ${isRed ? 'text-rose-600' : 'text-zinc-900'}`}>{card.value}</span>
    </div>
  );
};

export const BlackjackGame: React.FC<BlackjackGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [gameState, setGameState] = useState<'idle' | 'dealing' | 'insurance' | 'player_turn' | 'dealer_turn' | 'game_over'>('idle');
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const [dealStep, setDealStep] = useState<number>(0);
  const holeRef = useRef<Card | null>(null);
  const upcardRef = useRef<Card | null>(null);
  const mountedRef = useRef(true);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const trackTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (!mountedRef.current) return;
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  };

  const playerScore = calculateHandScore(playerCards);
  const dealerScore = calculateHandScore(dealerCards);
  const dealerFullScore = calculateFullScore(dealerCards);

  const handleDeal = () => {
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD) return;

    const stakeUSD = betAmountUSD;
    const balanceAfterBet = user.balanceUSD - stakeUSD;
    const naturalMult = blackjackNaturalMult(playMode === 'demo');

    soundFx.playCard();
    onUpdateBalance(balanceAfterBet);
    setLastBetUSD(stakeUSD);
    setResultMessage('');
    setGameState('dealing');

    const p1 = getRandomCard(true);
    const d1 = getRandomCard(true);
    const p2 = getRandomCard(true);
    const d2 = getRandomCard(false);
    upcardRef.current = d1;
    holeRef.current = d2;

    setPlayerCards([]);
    setDealerCards([]);
    setDealStep(0);

    trackTimeout(() => { soundFx.playCard(); setPlayerCards([p1]); setDealStep(1); }, 300);
    trackTimeout(() => { soundFx.playCard(); setDealerCards([d1]); setDealStep(2); }, 700);
    trackTimeout(() => { soundFx.playCard(); setPlayerCards([p1, p2]); setDealStep(3); }, 1100);
    trackTimeout(() => {
      soundFx.playCard();
      setDealerCards([d1, d2]);
      setDealStep(4);

      const pScore = calculateFullScore([p1, p2]);
      const dealerBJ = calculateFullScore([d1, { ...d2, visible: true }]) === 21;

      if (pScore === 21) {
        setDealerCards([d1, { ...d2, visible: true }]);
        if (dealerBJ) {
          onUpdateBalance(balanceAfterBet + stakeUSD);
          setResultMessage(t('push', lang));
          setGameState('game_over');
          onAddHistory({ id: String(Date.now()), gameId: 'blackjack', gameName: t('blackjackName', lang), timestamp: new Date(), betAmountUSD: stakeUSD, multiplier: 1, payoutUSD: stakeUSD, win: true, currency });
        } else {
          soundFx.playWin();
          confetti({ particleCount: 80, spread: 60 });
          const payoutUSD = stakeUSD * naturalMult;
          onUpdateBalance(balanceAfterBet + payoutUSD);
          setResultMessage(t('blackJackWin', lang));
          setGameState('game_over');
          onAddHistory({ id: String(Date.now()), gameId: 'blackjack', gameName: t('blackjackName', lang), timestamp: new Date(), betAmountUSD: stakeUSD, multiplier: naturalMult, payoutUSD, win: true, currency });
        }
      } else if (d1.value === 'A') {
        setGameState('insurance');
      } else if (dealerBJ) {
        setDealerCards([d1, { ...d2, visible: true }]);
        soundFx.playLoss();
        setResultMessage(t('dealerBlackjack', lang));
        setGameState('game_over');
        onAddHistory({ id: String(Date.now()), gameId: 'blackjack', gameName: t('blackjackName', lang), timestamp: new Date(), betAmountUSD: stakeUSD, multiplier: 0, payoutUSD: 0, win: false, currency });
      } else {
        setGameState('player_turn');
      }
    }, 1500);
  };

  const resolveDealerPeek = (insured: boolean, balanceNow: number) => {
    const up = upcardRef.current;
    const hole = holeRef.current;
    if (!up || !hole) {
      setGameState('player_turn');
      return;
    }
    const revealedHole = { ...hole, visible: true };
    const dealerBJ = calculateFullScore([up, revealedHole]) === 21;
    const stakeUSD = lastBetUSD;
    const insuranceCost = stakeUSD / 2;

    if (dealerBJ) {
      setDealerCards([up, revealedHole]);
      if (insured) {
        onUpdateBalance(balanceNow + insuranceCost * 3);
        setResultMessage(t('dealerBlackjack', lang));
      } else {
        soundFx.playLoss();
        setResultMessage(t('dealerBlackjack', lang));
      }
      setGameState('game_over');
      onAddHistory({
        id: String(Date.now()),
        gameId: 'blackjack',
        gameName: t('blackjackName', lang),
        timestamp: new Date(),
        betAmountUSD: stakeUSD,
        multiplier: insured ? 1 : 0,
        payoutUSD: insured ? stakeUSD : 0,
        win: insured,
        currency,
      });
      return;
    }

    setGameState('player_turn');
  };

  const handleTakeInsurance = () => {
    if (gameState !== 'insurance') return;
    const cost = lastBetUSD / 2;
    if (cost <= 0 || cost > user.balanceUSD) return;
    const after = user.balanceUSD - cost;
    onUpdateBalance(after);
    resolveDealerPeek(true, after);
  };

  const handleDeclineInsurance = () => {
    if (gameState !== 'insurance') return;
    resolveDealerPeek(false, user.balanceUSD);
  };

  const handleHit = () => {
    if (gameState !== 'player_turn') return;
    soundFx.playCard();
    const newCard = getRandomCard(true);
    const updated = [...playerCards, newCard];
    setPlayerCards(updated);
    const score = calculateFullScore(updated);
    if (score > 21) {
      soundFx.playLoss();
      setResultMessage(t('playerBust', lang));
      setGameState('game_over');
      onAddHistory({ id: String(Date.now()), gameId: 'blackjack', gameName: t('blackjackName', lang), timestamp: new Date(), betAmountUSD: lastBetUSD, multiplier: 0, payoutUSD: 0, win: false, currency });
    }
  };

  const settleRound = (pScore: number, dScore: number, stakeUSD: number, balanceAfterBet: number) => {
    let mult = 0;
    let msg = '';

    // Дилер перебрал — игрок всегда выигрывает (если сам ещё в игре)
    if (dScore > 21) {
      mult = 2;
      msg = t('dealerBust', lang);
    } else if (pScore > dScore) {
      mult = 2;
      msg = t('playerWins', lang);
    } else if (pScore === dScore) {
      mult = 1;
      msg = t('push', lang);
    } else {
      msg = t('dealerWins', lang);
    }

    const payoutUSD = stakeUSD * mult;
    const won = mult > 0;

    setResultMessage(msg);
    setGameState('game_over');

    if (won) {
      if (mult > 1) soundFx.playWin();
      // Баланс уже уменьшен на ставку при раздаче — возвращаем выплату целиком
      onUpdateBalance(balanceAfterBet + payoutUSD);
    } else {
      soundFx.playLoss();
    }

    onAddHistory({
      id: String(Date.now()),
      gameId: 'blackjack',
      gameName: t('blackjackName', lang),
      timestamp: new Date(),
      betAmountUSD: stakeUSD,
      multiplier: mult,
      payoutUSD,
      win: won,
      currency,
    });
  };

  const handleStand = () => {
    if (gameState !== 'player_turn') return;

    const stakeUSD = lastBetUSD;
    // Баланс после списания ставки (текущий user.balanceUSD уже без ставки)
    const balanceAfterBet = user.balanceUSD;
    const playerHand = [...playerCards];

    // Открываем скрытую карту дилера
    const revealed = dealerCards.map(c => ({ ...c, visible: true }));
    setDealerCards(revealed);
    setGameState('dealer_turn');

    let currentDealer = [...revealed];
    let dScore = calculateFullScore(currentDealer);

    const dealerPlay = () => {
      if (dScore < 17) {
        soundFx.playCard();
        const next = getRandomCard(true);
        currentDealer = [...currentDealer, next];
        dScore = calculateFullScore(currentDealer);
        setDealerCards([...currentDealer]);
        trackTimeout(dealerPlay, 600);
        return;
      }

      const pScore = calculateFullScore(playerHand);
      settleRound(pScore, dScore, stakeUSD, balanceAfterBet);
    };
    trackTimeout(dealerPlay, 500);
  };

  const visibleDealerScore = gameState === 'player_turn' || gameState === 'insurance' ? calculateHandScore(dealerCards.filter(c => c.visible)) : dealerFullScore;
  const insuranceCostUSD = lastBetUSD / 2;
  const canAffordInsurance = user.balanceUSD >= insuranceCostUSD;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <div className="lg:col-span-8 flex flex-col gap-2.5">
        <div className="relative bg-[#0b130e] border border-rose-900/40 rounded-2xl p-4 sm:p-5 min-h-[280px] sm:min-h-[320px] flex flex-col justify-between gap-4 overflow-hidden shadow-2xl red-border-glow">
          <div className="absolute inset-0 bg-[radial-gradient(#152e1f_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

          {/* Dealer Area */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {t('dealer', lang)}
              </span>
            </div>
            <div className="flex items-center gap-2 min-h-[80px]">
              {dealerCards.map((card, i) => <CardFace key={i} card={card} animate={i === dealerCards.length - 1} />)}
            </div>
            {dealerCards.length > 0 && (
              <span className="text-sm font-bold text-rose-300 bg-rose-950/60 px-3 py-0.5 rounded-full border border-rose-800/50">
                {gameState === 'player_turn' || gameState === 'insurance' ? `${visibleDealerScore} + ?` : visibleDealerScore}
              </span>
            )}
          </div>

          {gameState === 'insurance' && (
            <div className="relative z-20 text-center px-3">
              <div className="inline-flex items-center gap-2 bg-amber-950/80 border border-amber-700/60 rounded-xl px-3 py-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-amber-200">
                  {t('insuranceHint', lang)} ({formatCurrency(insuranceCostUSD, currency)})
                </span>
              </div>
            </div>
          )}

          {resultMessage && (
            <div className="relative z-20 text-center">
              <span className="font-display font-black text-2xl md:text-3xl text-rose-500 uppercase tracking-widest drop-shadow-[0_0_20px_rgba(225,29,72,0.8)]">
                {resultMessage}
              </span>
            </div>
          )}

          {/* Player Area */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 min-h-[80px]">
              {playerCards.map((card, i) => <CardFace key={i} card={card} animate={i === playerCards.length - 1} />)}
            </div>
            {playerCards.length > 0 && (
              <span className={`text-sm font-bold px-3 py-0.5 rounded-full border ${
                playerScore > 21
                  ? 'text-red-400 bg-red-950/60 border-red-800/50'
                  : playerScore === 21
                  ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50'
                  : 'text-zinc-300 bg-zinc-900/60 border-zinc-700/50'
              }`}>
                {t('player', lang)}: {playerScore}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-2.5">
        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={gameState === 'player_turn' || gameState === 'dealer_turn' || gameState === 'dealing' || gameState === 'insurance'}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={
            gameState === 'insurance'
              ? t('takeInsurance', lang)
              : gameState === 'player_turn'
              ? t('hit', lang)
              : t('dealCards', lang)
          }
          onAction={
            gameState === 'insurance'
              ? handleTakeInsurance
              : gameState === 'player_turn'
              ? handleHit
              : handleDeal
          }
          actionDisabled={
            gameState === 'insurance'
              ? !canAffordInsurance
              : gameState === 'player_turn'
              ? false
              : gameState !== 'idle' && gameState !== 'game_over'
          }
          secondaryAction={
            gameState === 'insurance'
              ? { label: t('noInsurance', lang), onClick: handleDeclineInsurance }
              : gameState === 'player_turn'
              ? { label: t('stand', lang), onClick: handleStand }
              : undefined
          }
          compact
        />
      </div>
    </div>
  );
};
