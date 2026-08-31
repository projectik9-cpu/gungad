import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { assertProfileOwnership } from './telegramAuth.js';

const router = express.Router();
const MIN_DEPOSIT_USD = 1;
const MAX_DEPOSIT_USD = 25_000;
const TXID_RE = /^[a-fA-F0-9]{32,128}$/;
let _bot = null;
export function setDepositTrc20Bot(bot) { _bot = bot; }

router.get('/info', (_req, res) => {
  res.json({
    ok: true,
    asset: 'USDT_TRC20',
    network: 'TRC20',
    receiving_address: config.payment.tronReceivingAddress,
  });
});

router.post('/create', async (req, res) => {
  try {
    const { profile_id, initData, amount_usd, txid } = req.body || {};
    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error, code: auth.code });

    const amountUsd = Number(amount_usd);
    const transactionId = String(txid || '').trim();
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_DEPOSIT_USD || amountUsd > MAX_DEPOSIT_USD) {
      return res.status(400).json({ error: `amount_usd must be ${MIN_DEPOSIT_USD}–${MAX_DEPOSIT_USD}` });
    }
    if (!TXID_RE.test(transactionId)) {
      return res.status(400).json({ error: 'Некорректный TXID TRC20', code: 'BAD_TXID' });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
    const { data, error } = await sb.rpc('gg_create_deposit', {
      p_profile_id: profile_id,
      p_provider: 'manual',
      p_asset: 'USDT_TRC20',
      p_amount_usd_cents: Math.round(amountUsd * 100),
      p_external_id: `trc20_${transactionId.toLowerCase()}`,
      p_meta: {
        requested_usd: amountUsd,
        network: 'TRC20',
        txid: transactionId,
        receiving_address: config.payment.tronReceivingAddress,
      },
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) {
        return res.status(409).json({ error: 'Этот TXID уже отправлен', code: 'DUPLICATE_TXID' });
      }
      logger.error(`[trc20/create] ${error.message}`);
      return res.status(500).json({ error: 'Не удалось создать заявку' });
    }

    if (_bot && config.admin.ids.length > 0) {
      const text = `₮ <b>Заявка на пополнение USDT TRC20</b>\n\nПрофиль: <code>${profile_id}</code>\nСумма: <b>$${amountUsd.toFixed(2)}</b>\nTXID: <code>${transactionId}</code>\nКошелёк получения: <code>${config.payment.tronReceivingAddress}</code>\n\nID: <code>${data.deposit_id}</code>`;
      const keyboard = { inline_keyboard: [[
        { text: '✅ Зачислить', callback_data: `dep_approve_${data.deposit_id}` },
        { text: '❌ Отклонить', callback_data: `dep_reject_${data.deposit_id}` },
      ]] };
      for (const adminId of [...new Set([...config.admin.ids, config.logChatId].filter(Boolean))]) {
        try {
          const message = await _bot.telegram.sendMessage(adminId, text, { parse_mode: 'HTML', reply_markup: keyboard });
          await sb.from('gg_deposit_requests')
            .update({ meta: { admin_message_id: message.message_id } })
            .eq('id', data.deposit_id);
        } catch (notifyError) {
          logger.warn(`[trc20/create] admin notify failed: ${notifyError?.message || notifyError}`);
        }
      }
    }

    return res.json({
      ok: true,
      deposit_id: data.deposit_id,
      status: 'pending',
      asset: 'USDT_TRC20',
      amount_usd: amountUsd,
      receiving_address: config.payment.tronReceivingAddress,
      txid: transactionId,
    });
  } catch (err) {
    logger.error(`[trc20/create] ${err?.message || err}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const { deposit_id } = req.query;
    if (!deposit_id) return res.status(400).json({ error: 'deposit_id required' });
    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
    const { data, error } = await sb.from('gg_deposit_requests')
      .select('id, status, amount_usd_cents, profile_id')
      .eq('id', deposit_id).maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'not found' });
    let balance_cents;
    if (data.status === 'completed') {
      const { data: wallet } = await sb.rpc('gg_get_wallet', { p_profile_id: data.profile_id });
      balance_cents = wallet?.balance_cents;
    }
    return res.json({ ok: true, status: data.status, amount_usd_cents: data.amount_usd_cents, balance_cents });
  } catch (err) {
    logger.error(`[trc20/status] ${err?.message || err}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
