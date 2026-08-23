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
      slots: '🎮 Bandit уже в приложении — нажми Play.',
      dice: '🎲 Кости уже в веб-приложении!',
      roulette: '🎡 Рулетка уже в веб-приложении!',
      blackjack: '🃏 Блэкджек уже в веб-приложении!',
      crash: '💥 Gun Crash уже в веб-приложении!',
      wheel: '🎯 Колесо фортуны - скоро будет доступно в веб-приложении!',
      mines: '💣 Мины уже в веб-приложении!',
      plinko: '📍 Плинко уже в веб-приложении!',
    };

    const message =
      gameMessages[gameType] || '🎮 Эта игра скоро будет доступна в веб-приложении!';

    await ctx.editMessageText(
      `${message}\n\n<b>Открой приложение GunGad кнопкой Play, чтобы зайти во все игры.</b>`,
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
