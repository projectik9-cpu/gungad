/**
 * Broadcast to every bot user. Copies the admin post (photo + caption, quotes, bold)
 * the same way Telegram copyMessage works — not a plain-text blast.
 */
import { getSupabaseAdmin } from '../database/supabase.js';
import { openCasinoKeyboard } from '../bot/keyboards.js';
import logger from '../utils/logger.js';
import { notifyLog } from './telegramLog.js';

const PAGE = 400;
const SEND_GAP_MS = 50;
const TG_TEXT_LIMIT = 3900;
const TG_CAPTION_LIMIT = 1024;
const MAIL_CMD_RE = /^\/(?:mail|announce|broadcast)(?:@\w+)?(?:[\t ]+|(?=\n)|$)/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tgErrorCode(err) {
  const n = Number(err?.response?.error_code || err?.code || 0);
  return Number.isFinite(n) ? n : 0;
}

function tgErrorText(err) {
  return String(err?.response?.description || err?.message || err || '');
}

/** Only real "user closed the bot" — never treat a bad payload (400) as blocked. */
function isUserBlockedBot(err) {
  const code = tgErrorCode(err);
  const desc = tgErrorText(err).toLowerCase();
  if (code === 403) return true;
  return /bot was blocked by the user|user is deactivated|chat not found|bot can't initiate conversation/.test(desc);
}

async function markBotBlocked(sb, profileId) {
  await sb
    .from('gg_profiles')
    .update({ bot_blocked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profileId);
}

export function getAdminPost(ctx) {
  return (
    ctx.message ||
    ctx.channelPost ||
    ctx.update?.channel_post ||
    ctx.editedChannelPost ||
    ctx.update?.edited_channel_post ||
    null
  );
}

function remapEntities(entities, prefixLen, newLen) {
  if (!Array.isArray(entities) || !entities.length || newLen <= 0) return undefined;
  const out = [];
  for (const e of entities) {
    const start = Number(e.offset) - prefixLen;
    const end = Number(e.offset) + Number(e.length) - prefixLen;
    const ns = Math.max(0, start);
    const ne = Math.min(newLen, end);
    if (ne <= ns) continue;
    const next = {
      type: e.type,
      offset: ns,
      length: ne - ns,
    };
    if (e.url) next.url = e.url;
    if (e.language) next.language = e.language;
    if (e.custom_emoji_id) next.custom_emoji_id = e.custom_emoji_id;
    if (e.user) next.user = e.user;
    out.push(next);
  }
  return out.length ? out : undefined;
}

function stripMailPrefix(raw) {
  const text = String(raw || '');
  const m = text.match(MAIL_CMD_RE);
  const prefixLen = m ? m[0].length : 0;
  return { prefixLen, text: text.slice(prefixLen).replace(/^\n/, '') };
}

function largestPhotoId(photo) {
  if (!Array.isArray(photo) || !photo.length) return null;
  return photo[photo.length - 1]?.file_id || null;
}

function casinoMarkup() {
  return openCasinoKeyboard().reply_markup;
}

function isMediaPost(post) {
  return Boolean(
    post?.photo ||
      post?.video ||
      post?.animation ||
      post?.document ||
      post?.audio ||
      post?.voice ||
      post?.video_note ||
      post?.sticker,
  );
}

function captionExtra(body, entities) {
  const extra = { reply_markup: casinoMarkup() };
  if (body) {
    extra.caption = body;
    extra.disable_web_page_preview = true;
    if (entities) extra.caption_entities = entities;
  }
  return extra;
}

/**
 * Build a per-user send function from the admin's /mail post.
 *
 * 1. Reply /mail on a finished post → exact copy (photo, quote, formatting).
 * 2. Photo/video with caption `/mail …` → same media, caption without `/mail`.
 * 3. Plain `/mail text` → text + casino button.
 */
export function createMailSender(telegram, ctx) {
  const post = getAdminPost(ctx);
  if (!post) {
    return { ok: false, reason: 'empty', summary: 'нет сообщения' };
  }

  const reply = post.reply_to_message;
  const fromChatId = post.chat?.id || ctx.chat?.id;
  const markup = casinoMarkup();

  if (reply && fromChatId && reply.message_id) {
    return {
      ok: true,
      summary: 'копия поста',
      sendOne: async (telegramId) => {
        await telegram.copyMessage(telegramId, fromChatId, reply.message_id, {
          reply_markup: markup,
        });
      },
    };
  }

  const raw = post.caption || post.text || '';
  const entitiesSrc = post.caption_entities || post.entities;
  const { prefixLen, text } = stripMailPrefix(raw);
  const media = isMediaPost(post);

  if (!media && !text.trim()) {
    return { ok: false, reason: 'empty', summary: 'пустой текст' };
  }

  const limit = media ? TG_CAPTION_LIMIT : TG_TEXT_LIMIT;
  const body = text.slice(0, limit);
  const entities = remapEntities(entitiesSrc, prefixLen, body.length);
  const extra = captionExtra(body, entities);
  const photoId = largestPhotoId(post.photo);
  const srcId = post.message_id;

  if (media && fromChatId && srcId) {
    return {
      ok: true,
      summary: photoId ? 'фото + подпись' : 'медиа + подпись',
      sendOne: async (telegramId) => {
        try {
          await telegram.copyMessage(telegramId, fromChatId, srcId, extra);
          return;
        } catch (err) {
          const plain = { reply_markup: markup };
          if (body) {
            plain.caption = body;
            plain.disable_web_page_preview = true;
          }
          if (photoId) {
            await telegram.sendPhoto(telegramId, photoId, plain);
            return;
          }
          if (post.video?.file_id) {
            await telegram.sendVideo(telegramId, post.video.file_id, plain);
            return;
          }
          if (post.animation?.file_id) {
            await telegram.sendAnimation(telegramId, post.animation.file_id, plain);
            return;
          }
          if (post.document?.file_id) {
            await telegram.sendDocument(telegramId, post.document.file_id, plain);
            return;
          }
          throw err;
        }
      },
    };
  }

  if (photoId) {
    return {
      ok: true,
      summary: 'фото + подпись',
      sendOne: (telegramId) => telegram.sendPhoto(telegramId, photoId, extra),
    };
  }

  const textExtra = {
    reply_markup: markup,
    disable_web_page_preview: true,
  };
  if (entities) textExtra.entities = entities;

  return {
    ok: true,
    summary: 'текст',
    sendOne: (telegramId) => telegram.sendMessage(telegramId, body, textExtra),
  };
}

/**
 * @param {{ telegram: import('telegraf').Telegram }} bot
 * @param {{ html?: string, sendOne?: Function, kind?: string, logTitle?: string }} opts
 */
export async function runUserBroadcast(bot, opts = {}) {
  const html = String(opts.html || '').trim();
  const sendOpts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: openCasinoKeyboard().reply_markup,
  };

  const sendOne =
    typeof opts.sendOne === 'function'
      ? opts.sendOne
      : html
        ? (telegramId) => bot.telegram.sendMessage(telegramId, html.slice(0, TG_TEXT_LIMIT), sendOpts)
        : null;

  if (!sendOne) {
    return { ok: false, reason: 'empty' };
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    logger.warn('[broadcast] supabase missing');
    return { ok: false, reason: 'no_supabase' };
  }

  const kind = String(opts.kind || `mail_${Date.now()}`).slice(0, 80);
  let runId = null;
  try {
    const { data: inserted, error: insErr } = await sb
      .from('gg_broadcast_runs')
      .insert({ kind, run_date: new Date().toISOString().slice(0, 10) })
      .select('id')
      .maybeSingle();
    if (insErr) {
      logger.warn(`[broadcast] run row skipped: ${insErr.message}`);
    } else {
      runId = inserted?.id || null;
    }
  } catch (e) {
    logger.warn(`[broadcast] run row skipped: ${e?.message || e}`);
  }

  let sent = 0;
  let fail = 0;
  let from = 0;
  let firstError = null;

  try {
    while (true) {
      const { data, error } = await sb
        .from('gg_profiles')
        .select('id, telegram_id')
        .eq('is_blocked', false)
        .not('telegram_id', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const row of data) {
        try {
          await sendOne(row.telegram_id);
          sent += 1;
        } catch (err) {
          const code = tgErrorCode(err);
          if (code === 429) {
            const wait = Number(err?.response?.parameters?.retry_after || 2) * 1000;
            await sleep(Math.min(Math.max(wait, 1000), 30_000));
            try {
              await sendOne(row.telegram_id);
              sent += 1;
            } catch (err2) {
              fail += 1;
              if (!firstError) firstError = tgErrorText(err2);
              if (isUserBlockedBot(err2)) await markBotBlocked(sb, row.id);
            }
          } else if (isUserBlockedBot(err)) {
            fail += 1;
            await markBotBlocked(sb, row.id);
          } else {
            fail += 1;
            if (!firstError) firstError = tgErrorText(err);
            logger.warn(`[broadcast] send ${row.telegram_id}: ${tgErrorText(err)}`);
          }
        }

        await sleep(SEND_GAP_MS);
      }

      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (runId) {
      await sb
        .from('gg_broadcast_runs')
        .update({
          finished_at: new Date().toISOString(),
          sent_count: sent,
          fail_count: fail,
        })
        .eq('id', runId);
    }

    logger.info(`[broadcast] done kind=${kind} sent=${sent} fail=${fail} first=${firstError || '-'}`);
    notifyLog(
      [
        opts.logTitle || '📣 <b>Рассылка</b>',
        `Отправлено: <b>${sent}</b>`,
        `Ошибки: <b>${fail}</b>`,
        firstError ? `Первая ошибка: <code>${String(firstError).slice(0, 180)}</code>` : null,
      ].filter(Boolean).join('\n'),
    ).catch(() => {});

    return { ok: true, kind, sent, fail, firstError };
  } catch (err) {
    logger.error(`[broadcast] ${err?.message || err}`);
    return { ok: false, reason: err?.message || String(err), sent, fail, firstError };
  }
}
