import { GameSession, User, Transaction } from '../database/models/index.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

class GameService {
  /**
   * Проверить возможность сделать ставку
   */
  async canPlaceBet(userId, betAmount) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    if (user.is_blocked) {
      throw new Error('User is blocked');
    }

    if (betAmount < config.game.minBet) {
      throw new Error(`Minimum bet is ${config.game.minBet}`);
    }

    if (betAmount > config.game.maxBet) {
      throw new Error(`Maximum bet is ${config.game.maxBet}`);
    }

    if (parseFloat(user.balance) < betAmount) {
      throw new Error('Insufficient balance');
    }

    return true;
  }

  /**
   * Создать игровую сессию
   */
  async createGameSession(userId, gameType, betAmount, result, winAmount, gameData = {}) {
    try {
      const user = await User.findByPk(userId);
      if (!user) throw new Error('User not found');

      const balanceBefore = parseFloat(user.balance);

      // Списываем ставку
      await user.subtractBalance(betAmount);

      let balanceAfter = parseFloat(user.balance);
      const multiplier = betAmount > 0 ? winAmount / betAmount : 0;

      // Создаём игровую сессию
      const gameSession = await GameSession.create({
        user_id: userId,
        game_type: gameType,
        bet_amount: betAmount,
        win_amount: winAmount,
        multiplier: multiplier,
        result: result,
        game_data: gameData,
      });

      // Создаём транзакцию на ставку
      await Transaction.create({
        user_id: userId,
        type: 'bet',
        amount: betAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Ставка в игре ${gameType}`,
        game_session_id: gameSession.id,
        metadata: { game_type: gameType },
      });

      // Если есть выигрыш, начисляем его
      if (winAmount > 0) {
        await user.addBalance(winAmount);
        balanceAfter = parseFloat(user.balance);

        await Transaction.create({
          user_id: userId,
          type: 'win',
          amount: winAmount,
          balance_before: parseFloat(user.balance) - winAmount,
          balance_after: balanceAfter,
          description: `Выигрыш в игре ${gameType}`,
          game_session_id: gameSession.id,
          metadata: { game_type: gameType, multiplier },
        });
      }

      // Обновляем статистику пользователя
      await user.increment('total_games_played');
      await user.increment('total_bet_amount', { by: betAmount });

      if (result === 'win') {
        await user.increment('total_wins');
        await user.increment('total_win_amount', { by: winAmount });
      } else if (result === 'loss') {
        await user.increment('total_losses');
      }

      // Начисляем опыт
      const experience = Math.floor(betAmount / 10);
      await user.increment('experience', { by: experience });

      // Проверяем уровень
      const newLevel = Math.floor(user.experience / 1000) + 1;
      if (newLevel > user.level) {
        await user.update({ level: newLevel });
        logger.info(`🎉 Пользователь ${userId} достиг уровня ${newLevel}`);
      }

      await user.reload();

      logger.logGameAction(userId, gameType, betAmount, result);

      return {
        gameSession,
        balance: parseFloat(user.balance),
        result,
        winAmount,
        multiplier,
      };
    } catch (error) {
      logger.error('Ошибка при создании игровой сессии:', error);
      throw error;
    }
  }

  /**
   * Получить историю игр пользователя
   */
  async getGameHistory(userId, limit = 20, offset = 0) {
    try {
      const gameSessions = await GameSession.findAndCountAll({
        where: { user_id: userId },
        limit,
        offset,
        order: [['created_at', 'DESC']],
      });

      return {
        games: gameSessions.rows,
        total: gameSessions.count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error('Ошибка при получении истории игр:', error);
      throw error;
    }
  }

  /**
   * Получить статистику по играм
   */
  async getGameStats(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) throw new Error('User not found');

      const gameTypeStats = await GameSession.findAll({
        where: { user_id: userId },
        attributes: [
          'game_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'games_played'],
          [sequelize.fn('SUM', sequelize.col('bet_amount')), 'total_bet'],
          [sequelize.fn('SUM', sequelize.col('win_amount')), 'total_win'],
        ],
        group: ['game_type'],
      });

      return {
        overall: {
          gamesPlayed: user.total_games_played,
          wins: user.total_wins,
          losses: user.total_losses,
          totalBet: parseFloat(user.total_bet_amount),
          totalWin: parseFloat(user.total_win_amount),
          winRate:
            user.total_games_played > 0
              ? ((user.total_wins / user.total_games_played) * 100).toFixed(2)
              : 0,
        },
        byGameType: gameTypeStats,
      };
    } catch (error) {
      logger.error('Ошибка при получении статистики игр:', error);
      throw error;
    }
  }
}

export default new GameService();
