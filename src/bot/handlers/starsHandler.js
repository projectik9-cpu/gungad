/**
 * Telegram Stars payment handlers.
 *
 * Flow:
 *  1. User taps "Buy Stars" in WebApp → calls createInvoice API (bot side).
 *  2. Telegram sends pre_checkout_query → bot must answer within 10s.
 *  3. Telegram sends message.successful_payment → gg_credit_stars RPC.
 *
 * Stars → USD cents conversion: 1 Star ≈ $0.013 (Telegram rate, adjust as needed).
 */
import logger from '../../utils/logger.js';
import { getSupabaseAdmin, ensureGgProfile } from '../../database/supabase.js';

const STARS_TO_CENTS = 1.3; // 1 Star = $0.013 → in cents: 1.3 cents

/** Convert stars amount to USD cents (rounded up, min 1) */
function starsToCents(stars) {
  return Math.max(1, Math.round(stars * STARS_TO_CENTS));
}

/**
 * Handles pre_checkout_query — must answer OK within 10s.
 */
export async function preCheckoutHandler(ctx) {
  try {
    await ctx.answerPreCheckoutQuery(true);
    logger.info('[stars] pre_checkout OK for user %d, stars=%d',
      ctx.from?.id, ctx.preCheckoutQuery?.invoice_payload);
  } catch (err) {
    logger.error('[stars] preCheckoutHandler error', err);
    await ctx.answerPreCheckoutQuery(false, 'Ошибка обработки платежа');
  }
}

/**
 * Handles successful_payment — credits Stars to gg_wallets.
 */
export async function successfulPaymentHandler(ctx) {
  try {
    const payment = ctx.message?.successful_payment;
    if (!payment) return;

    const tgUser = ctx.from;
    const chargeId = payment.telegram_payment_charge_id;
    const starsAmount = payment.total_amount; // in Stars (Telegram uses stars as currency units)
    const usdCents = starsToCents(starsAmount);
    const payload = payment.invoice_payload;

    logger.info('[stars] successful_payment user=%d stars=%d chargeId=%s',
      tgUser.id, starsAmount, chargeId);

    // Ensure profile exists
    const profileId = await ensureGgProfile(tgUser);
    if (!profileId) {
      logger.error('[stars] Could not ensure profile for user %d', tgUser.id);
      return;
    }

    const sb = getSupabaseAdmin();
    if (!sb) return;

    const { data, error } = await sb.rpc('gg_credit_stars', {
      p_profile_id:                   profileId,
      p_stars_amount:                 starsAmount,
      p_usd_cents:                    usdCents,
      p_telegram_payment_charge_id:   chargeId,
      p_payload:                      payload ?? null,
      p_meta:                         { telegram_id: tgUser.id },
    });

    if (error) {
      logger.error('[stars] gg_credit_stars error: %s', error.message);
      return;
    }

    logger.info('[stars] credited profile=%s stars=%d usd_cents=%d idempotent=%s',
      profileId, starsAmount, usdCents, data?.idempotent);

    // Notify user
    const usdFormatted = (usdCents / 100).toFixed(2);
    await ctx.reply(
      `⭐ Пополнение успешно!\n\n` +
      `+${starsAmount} Stars → +$${usdFormatted}\n` +
      `Баланс обновлён в казино.`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error('[stars] successfulPaymentHandler error', err);
  }
}

/**
 * Creates a Stars invoice link via bot API.
 * Call from /api/stars/create-invoice endpoint.
 */
export async function createStarsInvoice(bot, profileId, starsAmount, title = 'Пополнение баланса') {
  const prices = [{ label: title, amount: starsAmount }];

  const link = await bot.telegram.createInvoiceLink({
    title,
    description: `Пополнить ${starsAmount} Stars на счёт казино GunGad`,
    payload: `gg_topup_${profileId}_${starsAmount}_${Date.now()}`,
    currency: 'XTR', // Telegram Stars currency code
    prices,
  });

  return link;
}
