import { User, Transaction } from '../database/models/index.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

class UserService {
  /**
   * Получить или создать пользователя
   */
  async getOrCreateUser(telegramUser) {
    try {
      const [user, created] = await User.findOrCreate({
        where: { telegram_id: telegramUser.id },
        defaults: {
          telegram_id: telegramUser.id,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          language_code: telegramUser.language_code || 'ru',
          balance: config.game.startingBalance,
          last_activity: new Date(),
        },
      });

      if (created) {
        logger.info(
          `✨ Новый пользователь создан: ${user.telegram_id} (@${user.username || 'unknown'})`
        );
      } else {
        // Обновляем информацию и последнюю активность
        await user.update({
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          last_activity: new Date(),
        });
      }

      return { user, isNew: created };
    } catch (error) {
      logger.error('Ошибка при получении/создании пользователя:', error);
      throw error;
    }
  }

  /**
   * Получить пользователя по Telegram ID
   */
  async getUserByTelegramId(telegramId) {
    try {
      return await User.findOne({ where: { telegram_id: telegramId } });
    } catch (error) {
      logger.error('Ошибка при получении пользователя:', error);
      return null; // Возвращаем null вместо throw, чтобы бот продолжал работать
    }
  }

  /**
   * Обновить баланс пользователя
   */
  async updateBalance(userId, amount, type, description, metadata = null) {
    try {
      const user = await User.findByPk(userId);
      if (!user) throw new Error('User not found');

      const balanceBefore = parseFloat(user.balance);
      let balanceAfter;

      if (amount > 0) {
        balanceAfter = await user.addBalance(amount);
      } else {
        balanceAfter = await user.subtractBalance(Math.abs(amount));
      }

      // Создаём транзакцию
      await Transaction.create({
        user_id: userId,
        type,
        amount: Math.abs(amount),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description,
        metadata,
      });

      logger.logTransaction(userId, type, amount);

      return user;
    } catch (error) {
      logger.error('Ошибка при обновлении баланса:', error);
      throw error;
    }
  }

  /**
   * Получить баланс пользователя
   */
  async getBalance(telegramId) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      return user ? parseFloat(user.balance) : 0;
    } catch (error) {
      logger.error('Ошибка при получении баланса:', error);
      throw error;
    }
  }

  /**
   * Проверить ежедневный бонус
   */
  async checkDailyBonus(telegramId) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      if (!user) return { canClaim: false, timeLeft: null };

      const canClaim = user.canClaimDailyBonus();
      let timeLeft = null;

      if (!canClaim && user.last_daily_bonus) {
        const nextBonusTime = new Date(user.last_daily_bonus);
        nextBonusTime.setHours(nextBonusTime.getHours() + 24);
        timeLeft = nextBonusTime - new Date();
      }

      return { canClaim, timeLeft, user };
    } catch (error) {
      logger.error('Ошибка при проверке ежедневного бонуса:', error);
      throw error;
    }
  }

  /**
   * Получить ежедневный бонус
   */
  async claimDailyBonus(telegramId) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      if (!user) throw new Error('User not found');

      const bonusAmount = config.game.dailyBonusAmount;
      await user.claimDailyBonus(bonusAmount);

      // Создаём транзакцию
      await Transaction.create({
        user_id: user.id,
        type: 'daily_bonus',
        amount: bonusAmount,
        balance_before: parseFloat(user.balance) - bonusAmount,
        balance_after: parseFloat(user.balance),
        description: 'Ежедневный бонус',
      });

      logger.logTransaction(user.id, 'daily_bonus', bonusAmount);

      return { success: true, amount: bonusAmount, newBalance: user.balance };
    } catch (error) {
      logger.error('Ошибка при получении ежедневного бонуса:', error);
      throw error;
    }
  }

  /**
   * Получить статистику пользователя
   */
  async getUserStats(telegramId) {
    try {
      const user = await User.findOne({
        where: { telegram_id: telegramId },
        include: [
          {
            model: User,
            as: 'referrals',
            attributes: ['id', 'telegram_id', 'username', 'created_at'],
          },
        ],
      });

      if (!user) throw new Error('User not found');

      const winRate =
        user.total_games_played > 0
          ? ((user.total_wins / user.total_games_played) * 100).toFixed(2)
          : 0;

      return {
        profile: user.getPublicProfile(),
        stats: {
          winRate,
          totalGamesPlayed: user.total_games_played,
          totalWins: user.total_wins,
          totalLosses: user.total_losses,
          totalBetAmount: parseFloat(user.total_bet_amount),
          totalWinAmount: parseFloat(user.total_win_amount),
          referralCount: user.referrals ? user.referrals.length : 0,
          referralEarnings: parseFloat(user.referral_earnings),
        },
        referrals: user.referrals || [],
      };
    } catch (error) {
      logger.error('Ошибка при получении статистики пользователя:', error);
      throw error;
    }
  }

  /**
   * Обработать реферала
   */
  async handleReferral(newUserId, referrerId) {
    try {
      const newUser = await User.findByPk(newUserId);
      const referrer = await User.findByPk(referrerId);

      if (!newUser || !referrer || newUser.referrer_id) {
        return null;
      }

      // Устанавливаем реферера
      await newUser.update({ referrer_id: referrerId });

      // Начисляем бонус новому пользователю
      await this.updateBalance(
        newUserId,
        config.game.referralBonus,
        'bonus',
        'Бонус за регистрацию по реферальной ссылке'
      );

      // Начисляем награду рефереру
      await this.updateBalance(
        referrerId,
        config.game.referralReward,
        'referral',
        `Награда за приглашение пользователя @${newUser.username || newUser.telegram_id}`
      );

      await referrer.increment('referral_earnings', {
        by: config.game.referralReward,
      });

      logger.info(
        `💰 Реферальная награда: ${referrerId} пригласил ${newUserId}, начислено ${config.game.referralReward}`
      );

      return {
        bonusForNew: config.game.referralBonus,
        rewardForReferrer: config.game.referralReward,
      };
    } catch (error) {
      logger.error('Ошибка при обработке реферала:', error);
      throw error;
    }
  }

  /**
   * Проверить, заблокирован ли пользователь
   */
  async isUserBlocked(telegramId) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      return user ? user.is_blocked : false;
    } catch (error) {
      logger.error('Ошибка при проверке блокировки пользователя:', error);
      return false; // Если БД недоступна - не блокируем
    }
  }
}

export default new UserService();
