/**
 * Withdrawal requests — manual approval via Telegram Admin Bot.
 *
 * POST /api/withdraw/request
 *   Body: { profile_id, amount_usd, asset, address }
 *   Locks funds via gg_request_withdrawal RPC, notifies admins in Telegram
 *   with inline Approve / Reject buttons.
 *
 * GET /api/withdraw/list?profile_id=...
 *   Returns user's withdrawal history.
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { logWithdrawRequest } from '../../services/telegramLog.js';

const router = express.Router();

// Bot instance injected at server startup
let _bot = null;
export function setWithdrawBot(bot) { _bot = bot; }

const VALID_ASSETS = ['TON', 'USDT'];
const ERROR_MESSAGES = {
  MIN_WITHDRAW: 'Минимальный вывод — $7',
  BAD_ADDRESS: 'Некорректный адрес кошелька',
  WALLET_NOT_FOUND: 'Кошелёк не найден',
  WAGER_REQUIRED: 'Нужно сыграть хотя бы одну ставку перед выводом',
  INSUFFICIENT_FUNDS: 'Недостаточно средств',
};

router.post('/request', async (req, res) => {
  try {
    const { profile_id, amount_usd, asset = 'TON', address } = req.body || {};

    if (!profile_id || typeof profile_id !== 'string') {
      return res.status(400).json({ error: 'profile_id required' });
    }
    const amountUsd = Number(amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd < 7) {
      return res.status(400).json({ error: 'Минимальный вывод — $7', code: 'MIN_WITHDRAW' });
    }
    const upperAsset = String(asset).toUpperCase();
    if (!VALID_ASSETS.includes(upperAsset)) {
      return res.status(400).json({ error: `asset must be ${VALID_ASSETS.join(' | ')}` });
    }
    if (!address || String(address).trim().length < 10) {
      return res.status(400).json({ error: 'Некорректный адрес', code: 'BAD_ADDRESS' });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const amountCents = Math.round(amountUsd * 100);
    const { data, error } = await sb.rpc('gg_request_withdrawal', {
      p_profile_id: profile_id,
      p_amount_cents: amountCents,
      p_asset: upperAsset,
      p_address: String(address).trim(),
    });

    if (error) {
      const code = Object.keys(ERROR_MESSAGES).find(k => error.message?.includes(k));
      if (code) {
        return res.status(400).json({ error: ERROR_MESSAGES[code], code });
      }
      logger.error(`[withdraw/request] ${error.message}`);
      return res.status(500).json({ error: 'Ошибка создания заявки' });
    }

    const withdrawalId = data.withdrawal_id;

    // Fetch profile info for the admin message
    const { data: profile } = await sb
      .from('gg_profiles')
      .select('telegram_id, username, first_name')
      .eq('id', profile_id)
      .maybeSingle();

    // Notify admins with inline buttons
    if (_bot && config.admin.ids.length > 0) {
      const userLabel = profile?.username
        ? `@${profile.username}`
        : profile?.first_name ?? profile?.telegram_id ?? profile_id;

      const text = [
        '💸 <b>Заявка на вывод</b>',
        '',
        `Игрок: ${userLabel} (tg: <code>${profile?.telegram_id ?? '?'}</code>)`,
        `Сумма: <b>$${amountUsd.toFixed(2)}</b>`,
        `Актив: <b>${upperAsset}</b>`,
        `Адрес: <code>${String(address).trim()}</code>`,
        '',
        `ID: <code>${withdrawalId}</code>`,
      ].join('\n');

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Выплатил — подтвердить', callback_data: `wd_approve_${withdrawalId}` },
            { text: '❌ Отклонить', callback_data: `wd_reject_${withdrawalId}` },
          ],
          [
            { text: '✉️ Написать игроку', callback_data: `wd_msg_${withdrawalId}` },
          ],
        ],
      };

      for (const adminId of config.admin.ids) {
        try {
          const msg = await _bot.telegram.sendMessage(adminId, text, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
          // remember one admin_message_id (last)
          await sb.from('gg_withdrawals')
            .update({ admin_message_id: msg.message_id })
            .eq('id', withdrawalId);
        } catch (e) {
          logger.warn(`[withdraw] notify admin ${adminId} failed: ${e?.message || e}`);
        }
      }
    }

    logWithdrawRequest({
      withdrawalId,
      profileId: profile_id,
      amountUsd,
      asset: upperAsset,
      address: String(address).trim(),
    }).catch(() => {});

    logger.info(`[withdraw/request] created ${withdrawalId} profile=${profile_id} $${amountUsd} ${upperAsset}`);
    return res.json({ ok: true, withdrawal_id: withdrawalId, status: 'pending' });
  } catch (err) {
    logger.error(`[withdraw/request] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/list', async (req, res) => {
  try {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data, error } = await sb
      .from('gg_withdrawals')
      .select('id, amount_usd_cents, asset, recipient_address, status, created_at, processed_at')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      logger.warn(`[withdraw/list] ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch withdrawals' });
    }
    return res.json({ ok: true, withdrawals: data ?? [] });
  } catch (err) {
    logger.error(`[withdraw/list] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
