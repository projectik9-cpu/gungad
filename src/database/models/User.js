import { DataTypes, Model } from 'sequelize';
import sequelize from '../database.js';

class User extends Model {
  // Методы для работы с балансом
  async addBalance(amount) {
    this.balance += amount;
    await this.save();
    return this.balance;
  }

  async subtractBalance(amount) {
    if (this.balance < amount) {
      throw new Error('Insufficient balance');
    }
    this.balance -= amount;
    await this.save();
    return this.balance;
  }

  // Проверка возможности получить ежедневный бонус
  canClaimDailyBonus() {
    if (!this.last_daily_bonus) return true;
    const now = new Date();
    const lastBonus = new Date(this.last_daily_bonus);
    const diff = now - lastBonus;
    return diff >= 24 * 60 * 60 * 1000; // 24 часа
  }

  // Получение ежедневного бонуса
  async claimDailyBonus(amount) {
    if (!this.canClaimDailyBonus()) {
      throw new Error('Daily bonus already claimed');
    }
    await this.addBalance(amount);
    this.last_daily_bonus = new Date();
    await this.save();
    return amount;
  }

  // Метод для получения публичной информации о пользователе
  getPublicProfile() {
    return {
      id: this.id,
      telegram_id: this.telegram_id,
      username: this.username,
      first_name: this.first_name,
      balance: this.balance,
      level: this.level,
      experience: this.experience,
      total_games_played: this.total_games_played,
      total_wins: this.total_wins,
      total_losses: this.total_losses,
      created_at: this.created_at,
    };
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    telegram_id: {
      type: DataTypes.BIGINT,
      unique: true,
      allowNull: false,
      comment: 'Telegram User ID',
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Telegram Username',
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Telegram First Name',
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Telegram Last Name',
    },
    language_code: {
      type: DataTypes.STRING(10),
      defaultValue: 'ru',
      comment: 'User Language Code',
    },
    balance: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      allowNull: false,
      comment: 'User Balance',
    },
    level: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'User Level',
    },
    experience: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'User Experience Points',
    },
    total_games_played: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total Games Played',
    },
    total_wins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total Wins',
    },
    total_losses: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total Losses',
    },
    total_bet_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      comment: 'Total Amount Bet',
    },
    total_win_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      comment: 'Total Amount Won',
    },
    referrer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      comment: 'ID of user who referred this user',
    },
    referral_earnings: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      comment: 'Earnings from referrals',
    },
    last_daily_bonus: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last Daily Bonus Claim Date',
    },
    is_blocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Is User Blocked',
    },
    is_premium: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Is Premium User',
    },
    premium_until: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Premium Expiration Date',
    },
    last_activity: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Last Activity Date',
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['telegram_id'],
      },
      {
        fields: ['username'],
      },
      {
        fields: ['referrer_id'],
      },
    ],
  }
);

export default User;
