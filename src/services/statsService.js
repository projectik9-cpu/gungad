import { User, GameSession, Transaction } from '../database/models/index.js';
import { Op } from 'sequelize';
import sequelize from '../database/database.js';
import logger from '../utils/logger.js';

class StatsService {
  /**
   * Получить общую статистику по платформе
   */
  async getOverallStats() {
    try {
      const [
        totalUsers,
        activeUsersToday,
        totalGames,
        totalTransactions,
        totalBalance,
      ] = await Promise.all([
        User.count(),
        User.count({
          where: {
            last_activity: {
              [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
        GameSession.count(),
        Transaction.count(),
        User.sum('balance'),
      ]);

      const totalBetAmount = await GameSession.sum('bet_amount');
      const totalWinAmount = await GameSession.sum('win_amount');

      return {
        users: {
          total: totalUsers,
          activeToday: activeUsersToday,
        },
        games: {
          total: totalGames,
          totalBet: totalBetAmount || 0,
          totalWin: totalWinAmount || 0,
        },
        transactions: {
          total: totalTransactions,
        },
        economy: {
          totalBalance: totalBalance || 0,
        },
      };
    } catch (error) {
      logger.error('Ошибка при получении общей статистики:', error);
      throw error;
    }
  }

  /**
   * Получить статистику по играм
   */
  async getGameStats(period = 'all') {
    try {
      let whereClause = {};

      if (period === 'today') {
        whereClause.created_at = {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
        };
      } else if (period === 'week') {
        whereClause.created_at = {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        };
      } else if (period === 'month') {
        whereClause.created_at = {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        };
      }

      const gameStats = await GameSession.findAll({
        where: whereClause,
        attributes: [
          'game_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_games'],
          [sequelize.fn('SUM', sequelize.col('bet_amount')), 'total_bet'],
          [sequelize.fn('SUM', sequelize.col('win_amount')), 'total_win'],
          [
            sequelize.literal(
              'COUNT(CASE WHEN result = \'win\' THEN 1 END)'
            ),
            'wins',
          ],
          [
            sequelize.literal(
              'COUNT(CASE WHEN result = \'loss\' THEN 1 END)'
            ),
            'losses',
          ],
        ],
        group: ['game_type'],
        raw: true,
      });

      return gameStats;
    } catch (error) {
      logger.error('Ошибка при получении статистики игр:', error);
      throw error;
    }
  }

  /**
   * Получить топ игроков
   */
  async getTopPlayers(limit = 10, orderBy = 'balance') {
    try {
      const validOrderBy = ['balance', 'total_wins', 'total_games_played', 'level'];
      const order = validOrderBy.includes(orderBy) ? orderBy : 'balance';

      const topPlayers = await User.findAll({
        attributes: [
          'id',
          'telegram_id',
          'username',
          'first_name',
          'balance',
          'level',
          'total_games_played',
          'total_wins',
          'total_win_amount',
        ],
        order: [[order, 'DESC']],
        limit,
        where: {
          is_blocked: false,
        },
      });

      return topPlayers;
    } catch (error) {
      logger.error('Ошибка при получении топа игроков:', error);
      throw error;
    }
  }

  /**
   * Получить последние выигрыши
   */
  async getRecentWins(limit = 10, minWinAmount = 100) {
    try {
      const recentWins = await GameSession.findAll({
        where: {
          result: 'win',
          win_amount: {
            [Op.gte]: minWinAmount,
          },
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['telegram_id', 'username', 'first_name'],
          },
        ],
        order: [['created_at', 'DESC']],
        limit,
      });

      return recentWins;
    } catch (error) {
      logger.error('Ошибка при получении последних выигрышей:', error);
      throw error;
    }
  }

  /**
   * Получить статистику транзакций
   */
  async getTransactionStats(period = 'all') {
    try {
      let whereClause = {};

      if (period === 'today') {
        whereClause.created_at = {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
        };
      } else if (period === 'week') {
        whereClause.created_at = {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        };
      } else if (period === 'month') {
        whereClause.created_at = {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        };
      }

      const transactionStats = await Transaction.findAll({
        where: whereClause,
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
        ],
        group: ['type'],
        raw: true,
      });

      return transactionStats;
    } catch (error) {
      logger.error('Ошибка при получении статистики транзакций:', error);
      throw error;
    }
  }

  /**
   * Получить активность по дням
   */
  async getDailyActivity(days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const dailyGames = await GameSession.findAll({
        where: {
          created_at: {
            [Op.gte]: startDate,
          },
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'games_count'],
          [sequelize.fn('SUM', sequelize.col('bet_amount')), 'total_bet'],
        ],
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
        raw: true,
      });

      return dailyGames;
    } catch (error) {
      logger.error('Ошибка при получении ежедневной активности:', error);
      throw error;
    }
  }

  /**
   * Получить статистику реферальной программы
   */
  async getReferralStats() {
    try {
      const totalReferrals = await User.count({
        where: {
          referrer_id: {
            [Op.ne]: null,
          },
        },
      });

      const topReferrers = await User.findAll({
        attributes: [
          'id',
          'telegram_id',
          'username',
          'first_name',
          'referral_earnings',
          [
            sequelize.literal(
              '(SELECT COUNT(*) FROM users AS referrals WHERE referrals.referrer_id = User.id)'
            ),
            'referral_count',
          ],
        ],
        order: [[sequelize.literal('referral_count'), 'DESC']],
        limit: 10,
        raw: true,
      });

      return {
        totalReferrals,
        topReferrers,
      };
    } catch (error) {
      logger.error('Ошибка при получении статистики рефералов:', error);
      throw error;
    }
  }
}

export default new StatsService();
