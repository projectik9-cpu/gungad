import User from './User.js';
import Transaction from './Transaction.js';
import GameSession from './GameSession.js';

// Определяем связи между моделями
User.hasMany(Transaction, { foreignKey: 'user_id', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(GameSession, { foreignKey: 'user_id', as: 'gameSessions' });
GameSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

GameSession.hasMany(Transaction, { foreignKey: 'game_session_id', as: 'transactions' });
Transaction.belongsTo(GameSession, { foreignKey: 'game_session_id', as: 'gameSession' });

// Реферальная система - пользователь может пригласить других пользователей
User.hasMany(User, { foreignKey: 'referrer_id', as: 'referrals' });
User.belongsTo(User, { foreignKey: 'referrer_id', as: 'referrer' });

export { User, Transaction, GameSession };
