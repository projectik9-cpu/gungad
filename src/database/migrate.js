import { testConnection, syncDatabase } from './database.js';
import logger from '../utils/logger.js';
import '../database/models/index.js'; // Импортируем модели

/**
 * Скрипт для миграции базы данных
 */
async function migrate() {
  try {
    logger.info('🔄 Начало миграции базы данных...');

    // Проверяем подключение
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Не удалось подключиться к базе данных');
    }

    // Синхронизируем модели
    await syncDatabase(false); // false = не удалять существующие данные

    logger.info('✅ Миграция завершена успешно');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Ошибка миграции:', error);
    process.exit(1);
  }
}

migrate();
