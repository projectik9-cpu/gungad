import { Markup } from 'telegraf';
import config from '../config/config.js';

/**
 * Единственная кнопка — открыть казино (web app)
 */
export function openCasinoKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🎰 Открыть казино', config.web.webAppUrl)],
  ]);
}

/** @deprecated используй openCasinoKeyboard */
export function startInlineKeyboard() {
  return openCasinoKeyboard();
}

/**
 * Убрать reply-клавиатуру у пользователя
 */
export function removeReplyKeyboard() {
  return Markup.removeKeyboard();
}

/** @deprecated reply-меню больше не используется */
export function mainMenuKeyboard() {
  return removeReplyKeyboard();
}

/** @deprecated */
export function profileInlineKeyboard() {
  return openCasinoKeyboard();
}

/** @deprecated */
export function miniGamesKeyboard() {
  return openCasinoKeyboard();
}

/** @deprecated */
export function referralKeyboard(_userId) {
  return openCasinoKeyboard();
}

/** @deprecated */
export function adminKeyboard() {
  return openCasinoKeyboard();
}

/**
 * Inline клавиатура подтверждения
 */
export function confirmKeyboard(action) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Да', `confirm_${action}`),
      Markup.button.callback('❌ Нет', 'cancel'),
    ],
  ]);
}

/** Вместо «назад в меню» — снова только открыть казино */
export function backToMenuButton() {
  return openCasinoKeyboard();
}
