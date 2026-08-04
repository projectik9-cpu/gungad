/**
 * Admin bot handlers: withdrawal approval / rejection via inline buttons.
 * Callback data: wd_approve_<uuid> | wd_reject_<uuid>
 */
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';

function isAdmin(ctx) {
  return config.admin.ids.includes(ctx.from?.id);
}

async function notifyUser(bot, sb, profileId, text) {
  try {
    const { data: profile } = await sb
      .from('gg_profiles')
      .select('telegram_id')
      .eq('id', profileId)
      .maybeSingle();
    if (profile?.telegram_id) {
      await bot.telegram.sendMessage(profile.telegram_id, text, { parse_mode: 'HTML' });
    }
  } catch (e) {
    logger.warn(`[admin] notify user failed: ${e?.message || e}`);
  }
}

export function registerAdminHandlers(bot) {
  // Approve withdrawal
  bot.action(/^wd_approve_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const withdrawalId = ctx.match[1];
      const sb = getSupabaseAdmin();
      if (!sb) return ctx.answerCbQuery('БД недоступна', { show_alert: true });

      const { data, error } = await sb.rpc('gg_process_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_action: 'approved',
        p_admin_telegram_id: ctx.from.id,
      });

      if (error) {
        logger.error(`[admin] approve ${withdrawalId}: ${error.message}`);
        return ctx.answerCbQuery(`Ошибка: ${error.message.slice(0, 100)}`, { show_alert: true });
      }
      if (!data.ok) {
        return ctx.answerCbQuery(`Уже обработана (${data.status})`, { show_alert: true });
      }

      const amountUsd = (data.amount_usd_cents / 100).toFixed(2);
      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n✅ <b>ВЫПЛАЧЕНО</b> админом @${ctx.from.username ?? ctx.from.id}`,
        { parse_mode: 'HTML' },
      ).catch(() => {});
      await ctx.answerCbQuery('Заявка подтверждена ✅');

      await notifyUser(bot, sb, data.profile_id,
        `✅ <b>Вывод выполнен</b>\n\nСумма $${amountUsd} отправлена на ваш кошелёк. Спасибо за игру в GunGad!`);

      logger.info(`[admin] withdrawal ${withdrawalId} approved by ${ctx.from.id}`);
    } catch (e) {
      logger.error(`[admin] wd_approve: ${e?.message || e}`);
      ctx.answerCbQuery('Внутренняя ошибка').catch(() => {});
    }
  });

  // Reject withdrawal
  bot.action(/^wd_reject_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const withdrawalId = ctx.match[1];
      const sb = getSupabaseAdmin();
      if (!sb) return ctx.answerCbQuery('БД недоступна', { show_alert: true });

      const { data, error } = await sb.rpc('gg_process_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_action: 'rejected',
        p_admin_telegram_id: ctx.from.id,
      });

      if (error) {
        logger.error(`[admin] reject ${withdrawalId}: ${error.message}`);
        return ctx.answerCbQuery(`Ошибка: ${error.message.slice(0, 100)}`, { show_alert: true });
      }
      if (!data.ok) {
        return ctx.answerCbQuery(`Уже обработана (${data.status})`, { show_alert: true });
      }

      const amountUsd = (data.amount_usd_cents / 100).toFixed(2);
      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n❌ <b>ОТКЛОНЕНО</b> админом @${ctx.from.username ?? ctx.from.id}`,
        { parse_mode: 'HTML' },
      ).catch(() => {});
      await ctx.answerCbQuery('Заявка отклонена ❌');

      await notifyUser(bot, sb, data.profile_id,
        `❌ <b>Вывод отклонён</b>\n\nЗаявка на $${amountUsd} отклонена, средства возвращены на баланс. По вопросам пишите в поддержку.`);

      logger.info(`[admin] withdrawal ${withdrawalId} rejected by ${ctx.from.id}`);
    } catch (e) {
      logger.error(`[admin] wd_reject: ${e?.message || e}`);
      ctx.answerCbQuery('Внутренняя ошибка').catch(() => {});
    }
  });
}
