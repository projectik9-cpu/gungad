import { DataTypes, Model } from 'sequelize';
import sequelize from '../database.js';

class Transaction extends Model {}

Transaction.init(
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
    type: {
      type: DataTypes.ENUM(
        'deposit',
        'withdrawal',
        'bet',
        'win',
        'bonus',
        'referral',
        'daily_bonus',
        'admin_adjustment'
      ),
      allowNull: false,
      comment: 'Transaction Type',
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Transaction Amount',
    },
    balance_before: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Balance Before Transaction',
    },
    balance_after: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Balance After Transaction',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Transaction Description',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Additional Transaction Data',
    },
    game_session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'game_sessions',
        key: 'id',
      },
      comment: 'Related Game Session ID',
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
      defaultValue: 'completed',
      comment: 'Transaction Status',
    },
  },
  {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id'],
      },
      {
        fields: ['type'],
      },
      {
        fields: ['created_at'],
      },
      {
        fields: ['game_session_id'],
      },
    ],
  }
);

export default Transaction;
