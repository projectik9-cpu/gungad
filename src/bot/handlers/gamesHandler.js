import logger from '../../utils/logger.js';
import { messages } from '../messages.js';
import { miniGamesKeyboard } from '../keyboards.js';

/**
 * Обработчик команды /games
 */
export async function gamesHandler(ctx) {
  try {
    const gamesMessage = messages.miniGames();

    await ctx.reply(gamesMessage, {
      parse_mode: 'HTML',
      reply_markup: miniGamesKeyboard().reply_markup,
    });

    logger.logUserAction(ctx.from.id, ctx.from.username, 'VIEW_GAMES');
  } catch (error) {
    logger.logError(error, 'gamesHandler');
    await ctx.reply(messages.errors.generic);
  }
}

/**
 * Обработчики callback для конкретных игр
 */
export async function gameCallbackHandler(ctx) {
  try {
    const gameType = ctx.match[1]; // Извлекаем тип игры из callback_data (game_slots -> slots)

    await ctx.answerCbQuery();

    const gameMessages = {
      slots: '🎰 Слоты - скоро будут доступны в веб-приложении!',
      dice: '🎲 Игра в кости - скоро будет доступна в веб-приложении!',
      roulette: '🎡 Рулетка - скоро будет доступна в веб-приложении!',
      blackjack: '🃏 Блэкджек - скоро будет доступен в веб-приложении!',
      crash: '💥 Crash - скоро будет доступен в веб-приложении!',
      wheel: '🎯 Колесо фортуны - скоро будет доступно в веб-приложении!',
    };

    const message =
      gameMessages[gameType] || '🎮 Эта игра скоро будет доступна в веб-приложении!';

    await ctx.editMessageText(
      `${message}\n\n<b>Откройте веб-приложение GunGad Casino для доступа ко всем играм!</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: miniGamesKeyboard().reply_markup,
      }
    );

    logger.logUserAction(ctx.from.id, ctx.from.username, `VIEW_GAME_${gameType.toUpperCase()}`);
  } catch (error) {
    logger.logError(error, 'gameCallbackHandler');
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (e) {
      // Игнорируем ошибки при ответе на callback
    }
  }
}
