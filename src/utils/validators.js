import Joi from 'joi';

/**
 * Валидаторы для различных данных
 */

/**
 * Валидация ставки
 */
export function validateBet(amount, minBet, maxBet) {
  const schema = Joi.number().min(minBet).max(maxBet).required();
  const { error, value } = schema.validate(amount);

  if (error) {
    throw new Error(`Invalid bet amount: ${error.message}`);
  }

  return value;
}

/**
 * Валидация ID пользователя Telegram
 */
export function validateTelegramId(id) {
  const schema = Joi.number().integer().positive().required();
  const { error, value } = schema.validate(id);

  if (error) {
    throw new Error(`Invalid Telegram ID: ${error.message}`);
  }

  return value;
}

/**
 * Валидация данных пользователя
 */
export function validateUserData(data) {
  const schema = Joi.object({
    telegram_id: Joi.number().integer().positive().required(),
    username: Joi.string().alphanum().min(3).max(32).allow(null),
    first_name: Joi.string().max(64).allow(null),
    last_name: Joi.string().max(64).allow(null),
    language_code: Joi.string().length(2).allow(null),
  });

  const { error, value } = schema.validate(data);

  if (error) {
    throw new Error(`Invalid user data: ${error.message}`);
  }

  return value;
}

/**
 * Валидация суммы транзакции
 */
export function validateTransactionAmount(amount) {
  const schema = Joi.number().positive().precision(2).required();
  const { error, value } = schema.validate(amount);

  if (error) {
    throw new Error(`Invalid transaction amount: ${error.message}`);
  }

  return value;
}

/**
 * Проверка, является ли пользователь администратором
 */
export function isAdmin(telegramId, adminIds) {
  return adminIds.includes(telegramId);
}
