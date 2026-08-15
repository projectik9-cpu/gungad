/**
 * Telegram Stars payment handlers.
 *
 * Flow:
 *  1. User taps Stars in cashier → /api/stars/invoice
 *  2. Telegram pre_checkout_query → answer within 10s
 *  3. successful_payment → gg_credit_stars (stars wallet only, no USD conversion)
 */
import logger from '../../utils/logger.js';
import { getSupabaseAdmin, ensureGgProfile } from '../../database/supabase.js';
import { logStarsTopup } from '../../services/telegramLog.js';

/**
 * Handles pre_checkout_query — must answer OK within 10s.
 */
export async function preCheckoutHandler(ctx) {
  try {
    await ctx.answerPreCheckoutQuery(true);
    logger.info('[stars] pre_checkout OK for user %d, payload=%s',
      ctx.from?.id, ctx.preCheckoutQuery?.invoice_payload);
  } catch (err) {
    logger.error('[stars] preCheckoutHandler error', err);
    await ctx.answerPreCheckoutQuery(false, 'Ошибка обработки платежа');
  }
}

/**
 * Handles successful_payment — credits Stars wallet (not USD play balance).
 */
export async function successfulPaymentHandler(ctx) {
  try {
    const payment = ctx.message?.successful_payment;
    if (!payment) return;

    const tgUser = ctx.from;
    const chargeId = payment.telegram_payment_charge_id;
    const starsAmount = payment.total_amount;
    const payload = payment.invoice_payload;

    logger.info('[stars] successful_payment user=%d stars=%d chargeId=%s',
      tgUser.id, starsAmount, chargeId);

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
      p_usd_cents:                    0,
      p_telegram_payment_charge_id:   chargeId,
      p_payload:                      payload ?? null,
      p_meta:                         { telegram_id: tgUser.id },
    });

    if (error) {
      logger.error('[stars] gg_credit_stars error: %s', error.message);
      return;
    }

    logger.info('[stars] credited profile=%s stars=%d balance=%d idempotent=%s',
      profileId, starsAmount, data?.stars_balance, data?.idempotent);

    logStarsTopup({
      profileId,
      starsAmount,
      usdCents: 0,
      idempotent: Boolean(data?.idempotent),
    }).catch(() => {});

    await ctx.reply(
      `⭐ Пополнение успешно!\n\n` +
      `+${starsAmount} Stars\n` +
      `Звёзды зачислены на отдельный баланс.`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    logger.error('[stars] successfulPaymentHandler error', err);
  }
}

/**
 * Creates a Stars invoice link via bot API (currency XTR, no provider token).
 */
export async function createStarsInvoice(bot, profileId, starsAmount, title = 'Telegram Stars') {
  const prices = [{ label: title, amount: starsAmount }];

  const link = await bot.telegram.createInvoiceLink({
    title,
    description: `${starsAmount} Telegram Stars — GunGad`,
    payload: `gg_stars_${profileId}_${starsAmount}_${Date.now()}`,
    provider_token: '',
    currency: 'XTR',
    prices,
  });

  return link;
}
