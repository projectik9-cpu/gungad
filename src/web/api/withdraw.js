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

const VALID_ASSETS = ['TON', 'USDT', 'TRC20', 'STARS'];
const ALLOWED_STARS_WITHDRAWALS = new Set([25, 50, 75, 100, 500, 1000, 5000]);
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const ERROR_MESSAGES = {
  MIN_WITHDRAW: 'Минимальный вывод — $7',
  BAD_ADDRESS: 'Некорректный адрес кошелька',
  WALLET_NOT_FOUND: 'Кошелёк не найден',
  WAGER_REQUIRED: 'Нужно сыграть хотя бы одну ставку перед выводом',
  INSUFFICIENT_FUNDS: 'Недостаточно средств',
};

router.post('/request', async (req, res) => {
  try {
    const { profile_id, amount_usd, stars_amount, asset = 'TON', address } = req.body || {};

    if (!profile_id || typeof profile_id !== 'string') {
      return res.status(400).json({ error: 'profile_id required' });
    }
    const upperAsset = String(asset).toUpperCase();
    if (!VALID_ASSETS.includes(upperAsset)) {
      return res.status(400).json({ error: `asset must be ${VALID_ASSETS.join(' | ')}` });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    if (upperAsset === 'STARS') {
      const stars = Math.round(Number(stars_amount ?? amount_usd));
      if (!Number.isInteger(stars) || !ALLOWED_STARS_WITHDRAWALS.has(stars)) {
        return res.status(400).json({ error: 'Выберите доступную сумму Stars: 25, 50, 75, 100, 500, 1000 или 5000', code: 'INVALID_STARS_AMOUNT' });
      }

      const { data: profile } = await sb
        .from('gg_profiles')
        .select('telegram_id, username, first_name')
        .eq('id', profile_id)
        .maybeSingle();

      const dest = `tg:${profile?.telegram_id ?? profile_id}`;
      const { data, error } = await sb.rpc('gg_request_star_withdrawal', {
        p_profile_id: profile_id,
        p_stars: stars,
        p_address: dest,
      });

      if (error) {
        const code = Object.keys(ERROR_MESSAGES).find(k => error.message?.includes(k));
        if (code) {
          return res.status(400).json({ error: ERROR_MESSAGES[code], code });
        }
        logger.error(`[withdraw/request] stars ${error.message}`);
        return res.status(500).json({ error: 'Ошибка создания заявки' });
      }

      const withdrawalId = data.withdrawal_id;
      const userLabel = profile?.username
        ? `@${profile.username}`
        : profile?.first_name ?? profile?.telegram_id ?? profile_id;

      if (_bot && config.admin.ids.length > 0) {
        const text = [
          '⭐ <b>Заявка на вывод Stars</b>',
          '',
          `Игрок: ${userLabel} (tg: <code>${profile?.telegram_id ?? '?'}</code>)`,
          `Сумма: <b>⭐ ${stars}</b>`,
          `Актив: <b>STARS</b>`,
          `Куда: Telegram игрока (резервный акк → этому юзеру)`,
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

        const targets = [...new Set([...config.admin.ids, config.logChatId].filter(Boolean))];
        for (const adminId of targets) {
          try {
            const msg = await _bot.telegram.sendMessage(adminId, text, {
              parse_mode: 'HTML',
              reply_markup: keyboard,
            });
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
        amountUsd: stars,
        asset: 'STARS',
        address: dest,
      }).catch(() => {});

      logger.info(`[withdraw/request] created ${withdrawalId} profile=${profile_id} ⭐${stars} STARS`);
      return res.json({
        ok: true,
        withdrawal_id: withdrawalId,
        status: 'pending',
        stars_balance: data.stars_balance,
      });
    }

    const amountUsd = Number(amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd < 7) {
      return res.status(400).json({ error: 'Минимальный вывод — $7', code: 'MIN_WITHDRAW' });
    }
    if (!address || String(address).trim().length < 10) {
      return res.status(400).json({ error: 'Некорректный адрес', code: 'BAD_ADDRESS' });
    }

    if (upperAsset === 'TRC20' && !TRON_ADDRESS_RE.test(String(address).trim())) {
      return res.status(400).json({ error: 'Некорректный TRC20-адрес', code: 'BAD_ADDRESS' });
    }

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

      const targets = [...new Set([...config.admin.ids, config.logChatId].filter(Boolean))];
      for (const adminId of targets) {
        try {
          const msg = await _bot.telegram.sendMessage(adminId, text, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
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

router.post('/cancel', async (req, res) => {
  try {
    const { profile_id, withdrawal_id } = req.body || {};
    if (!profile_id || !withdrawal_id) {
      return res.status(400).json({ error: 'profile_id and withdrawal_id required' });
    }
    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data, error } = await sb.rpc('gg_cancel_withdrawal', {
      p_withdrawal_id: withdrawal_id,
      p_profile_id: profile_id,
    });
    if (error) {
      const msg = error.message || '';
      if (/NOT_FOUND/i.test(msg)) return res.status(404).json({ error: 'Заявка не найдена' });
      if (/ALREADY/i.test(msg) || /NOT_PENDING/i.test(msg)) {
        return res.status(409).json({ error: 'Заявка уже обработана' });
      }
      logger.error(`[withdraw/cancel] ${msg}`);
      return res.status(500).json({ error: 'Не удалось отменить заявку' });
    }
    if (data && data.ok === false) {
      return res.status(409).json({ error: 'Заявка уже обработана', status: data.status });
    }
    logger.info(`[withdraw/cancel] ${withdrawal_id} profile=${profile_id}`);
    return res.json({
      ok: true,
      status: 'cancelled',
      balance_cents: data?.balance_cents,
      stars_balance: data?.stars_balance,
      asset: data?.asset,
      amount_usd_cents: data?.amount_usd_cents,
    });
  } catch (err) {
    logger.error(`[withdraw/cancel] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
