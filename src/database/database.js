import { Sequelize } from 'sequelize';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Создаём подключение к БД
const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  }
);

// Проверка подключения
export async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('✅ Подключение к базе данных установлено успешно');
    return true;
  } catch (error) {
    logger.error('❌ Ошибка подключения к базе данных:', error);
    return false;
  }
}

// Синхронизация моделей
export async function syncDatabase(force = false) {
  try {
    await sequelize.sync({ force });
    logger.info(`✅ База данных синхронизирована${force ? ' (FORCE MODE)' : ''}`);
  } catch (error) {
    logger.error('❌ Ошибка синхронизации базы данных:', error);
    throw error;
  }
}

export default sequelize;
