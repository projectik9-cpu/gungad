import { DataTypes, Model } from 'sequelize';
import sequelize from '../database.js';

class GameSession extends Model {}

GameSession.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      comment: 'User ID',
    },
    game_type: {
      type: DataTypes.ENUM(
        'slot_machine',
        'roulette',
        'dice',
        'blackjack',
        'crash',
        'wheel',
        'mines',
        'plinko'
      ),
      allowNull: false,
      comment: 'Game Type',
    },
    bet_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Bet Amount',
    },
    win_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      comment: 'Win Amount',
    },
    multiplier: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Win Multiplier',
    },
    result: {
      type: DataTypes.ENUM('win', 'loss', 'draw'),
      allowNull: false,
      comment: 'Game Result',
    },
    game_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Detailed Game Data (numbers, cards, etc)',
    },
    session_duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Session Duration in seconds',
    },
    is_jackpot: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Is Jackpot Win',
    },
  },
  {
    sequelize,
    modelName: 'GameSession',
    tableName: 'game_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id'],
      },
      {
        fields: ['game_type'],
      },
      {
        fields: ['created_at'],
      },
      {
        fields: ['is_jackpot'],
      },
    ],
  }
);

export default GameSession;
