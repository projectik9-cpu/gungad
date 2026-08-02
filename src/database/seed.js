import { User } from './models/index.js';
import { testConnection } from './database.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

/**
 * Скрипт для заполнения базы данных тестовыми данными
 */
async function seed() {
  try {
    logger.info('🌱 Начало заполнения базы данных...');

    // Проверяем подключение
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Не удалось подключиться к базе данных');
    }

    // Проверяем, есть ли уже пользователи
    const usersCount = await User.count();
    if (usersCount > 0) {
      logger.info(`ℹ️  База данных уже содержит ${usersCount} пользователей`);
      const answer = await promptUser('Удалить существующие данные? (yes/no): ');
      if (answer.toLowerCase() !== 'yes') {
        logger.info('❌ Заполнение отменено');
        process.exit(0);
      }
      await User.destroy({ where: {}, truncate: true });
    }

    // Создаём тестовых пользователей
    logger.info('👥 Создание тестовых пользователей...');

    const testUsers = [
      {
        telegram_id: 123456789,
        username: 'test_user_1',
        first_name: 'Test',
        last_name: 'User 1',
        balance: 10000,
        level: 5,
        experience: 5000,
      },
      {
        telegram_id: 987654321,
        username: 'test_user_2',
        first_name: 'Test',
        last_name: 'User 2',
        balance: 5000,
        level: 3,
        experience: 3000,
      },
    ];

    for (const userData of testUsers) {
      await User.create(userData);
      logger.info(`✅ Создан пользователь: ${userData.username}`);
    }

    logger.info('✅ Заполнение базы данных завершено успешно');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Ошибка заполнения базы данных:', error);
    process.exit(1);
  }
}

/**
 * Вспомогательная функция для получения ввода пользователя
 */
function promptUser(question) {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

seed();
