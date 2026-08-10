/**
 * Support tickets from the Mini App.
 *
 * POST /api/support/ticket
 *   Body: { profile_id, message }
 *   Saves ticket in gg_support_tickets, forwards to admins in Telegram.
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { logSupportTicket } from '../../services/telegramLog.js';

const router = express.Router();

let _bot = null;
export function setSupportBot(bot) { _bot = bot; }

const MAX_MESSAGE_LEN = 2000;

router.post('/ticket', async (req, res) => {
  try {
    const { profile_id, message } = req.body || {};

    const text = String(message ?? '').trim();
    if (!text || text.length < 3) {
      return res.status(400).json({ error: 'Сообщение слишком короткое' });
    }
    if (text.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: `Максимум ${MAX_MESSAGE_LEN} символов` });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    let profile = null;
    if (profile_id) {
      const { data } = await sb
        .from('gg_profiles')
        .select('id, telegram_id, username, first_name')
        .eq('id', profile_id)
        .maybeSingle();
      profile = data;
    }

    const { data: ticket, error } = await sb
      .from('gg_support_tickets')
      .insert({
        profile_id: profile?.id ?? null,
        telegram_id: profile?.telegram_id ?? null,
        username: profile?.username ?? null,
        message: text,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(`[support/ticket] insert: ${error.message}`);
      return res.status(500).json({ error: 'Не удалось отправить обращение' });
    }

    if (_bot && config.admin.ids.length > 0) {
      const userLabel = profile?.username
        ? `@${profile.username}`
        : profile?.first_name ?? profile?.telegram_id ?? 'аноним';

      const adminText = [
        '🆘 <b>Обращение в поддержку</b>',
        '',
        `От: ${userLabel} (tg: <code>${profile?.telegram_id ?? '?'}</code>)`,
        '',
        text,
        '',
        `Тикет: <code>${ticket.id}</code>`,
      ].join('\n');

      const keyboard = {
        inline_keyboard: [[
          { text: '💬 Ответить', callback_data: `sup_reply_${ticket.id}` },
          { text: '🔒 Закрыть', callback_data: `sup_close_${ticket.id}` },
        ]],
      };

      for (const adminId of config.admin.ids) {
        try {
          const msg = await _bot.telegram.sendMessage(adminId, adminText, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
          await sb.from('gg_support_tickets')
            .update({
              admin_message_id: msg.message_id,
              admin_telegram_id: adminId,
            })
            .eq('id', ticket.id);
        } catch (e) {
          logger.warn(`[support] notify admin ${adminId} failed: ${e?.message || e}`);
        }
      }
    }

    logSupportTicket({
      ticketId: ticket.id,
      profile,
      message: text,
    }).catch(() => {});

    logger.info(`[support/ticket] created ${ticket.id} from profile=${profile_id ?? 'anon'}`);
    return res.json({ ok: true, ticket_id: ticket.id });
  } catch (err) {
    logger.error(`[support/ticket] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
