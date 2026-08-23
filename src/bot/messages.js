/**
 * Шаблоны сообщений для бота
 */

export const messages = {
  /**
   * Приветственное сообщение
   */
  welcome: (user, isNew) => {
    if (isNew) {
      return `
🎮 <b>Добро пожаловать в GunGad</b>

Привет, <b>${user.first_name}</b>!

На твой счёт зачислено <b>${user.balance} монет</b>.

<b>Что можно сделать:</b>
🎮 Открыть приложение с играми
🎁 Забирать ежедневный бонус
👥 Приглашать друзей

Нажми <b>Play</b> ниже, чтобы открыть игры.
      `.trim();
    } else {
      return `
🎮 <b>С возвращением в GunGad</b>

Рады видеть тебя, <b>${user.first_name}</b>.

Баланс: <b>${user.balance} монет</b>

Нажми <b>Play</b>, чтобы продолжить играть.
      `.trim();
    }
  },

  /**
   * Сообщение о балансе
   */
  balance: (user) => {
    return `
💰 <b>Твой баланс</b>

<b>${user.balance}</b> монет

Уровень: <b>${user.level}</b> 🏆
Опыт: <b>${user.experience}</b> ⭐

Всего игр сыграно: <b>${user.total_games_played}</b>
Побед: <b>${user.total_wins}</b> ✅
Поражений: <b>${user.total_losses}</b> ❌
    `.trim();
  },

  /**
   * Сообщение профиля
   */
  profile: (user) => {
    const winRate =
      user.total_games_played > 0
        ? ((user.total_wins / user.total_games_played) * 100).toFixed(2)
        : 0;

    return `
👤 <b>Твой профиль</b>

👤 ID: <code>${user.telegram_id}</code>
${user.username ? `📝 Username: @${user.username}\n` : ''}
💰 Баланс: <b>${user.balance}</b> монет
🏆 Уровень: <b>${user.level}</b>
⭐ Опыт: <b>${user.experience}</b>

📊 <b>Статистика:</b>
🎮 Игр сыграно: <b>${user.total_games_played}</b>
✅ Побед: <b>${user.total_wins}</b>
❌ Поражений: <b>${user.total_losses}</b>
📈 Винрейт: <b>${winRate}%</b>
🎮 Очки за игры: <b>${user.total_bet_amount}</b>
⭐ Очки за результаты: <b>${user.total_win_amount}</b>

📅 Регистрация: ${new Date(user.created_at).toLocaleDateString('ru-RU')}
    `.trim();
  },

  /**
   * Сообщение о ежедневном бонусе
   */
  dailyBonus: {
    success: (amount, newBalance) => {
      return `
🎁 <b>Ежедневный бонус получен!</b>

Вы получили: <b>+${amount}</b> монет 💰
Новый баланс: <b>${newBalance}</b> монет

Возвращайтесь завтра за новым бонусом! 🎉
      `.trim();
    },
    alreadyClaimed: (timeLeft) => {
      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

      return `
⏰ <b>Бонус уже получен сегодня</b>

Следующий бонус будет доступен через:
<b>${hours} ч ${minutes} мин</b>

Возвращайтесь позже! 😊
      `.trim();
    },
  },

  /**
   * Сообщение о реферальной программе
   */
  referral: (user, referralCount, referralEarnings) => {
    const botUsername = process.env.BOT_USERNAME || 'your_bot';
    const referralLink = `https://t.me/${botUsername}?start=ref${user.id}`;

    return `
👥 <b>Реферальная программа</b>

Приглашай друзей и получай награды! 🎁

<b>Твоя реферальная ссылка:</b>
<code>${referralLink}</code>

<b>Условия:</b>
• Новый пользователь получает <b>500</b> монет 💰
• Ты получаешь <b>250</b> монет за каждого приглашенного! 🎉

<b>Твоя статистика:</b>
👥 Рефералов: <b>${referralCount}</b>
💎 Заработано: <b>${referralEarnings}</b> монет

Поделись ссылкой с друзьями! ⬇️
    `.trim();
  },

  /**
   * Сообщение помощи
   */
  help: () => {
    return `
ℹ️ <b>Помощь — GunGad</b>

<b>Основные команды:</b>
/start - Запуск бота
/balance - Проверить баланс
/profile - Посмотреть профиль
/games - Список мини-игр
/bonus - Получить ежедневный бонус
/ref - Реферальная программа
/help - Эта справка

<b>Как играть:</b>
1️⃣ Нажми кнопку <b>Play</b>
2️⃣ Выбери игру в приложении
3️⃣ Играй

<b>Игры:</b>
🎮 Bandit, кости, рулетка, блэкджек, crash, колесо

<b>Бонусы:</b>
🎁 Ежедневный бонус - 100 монет каждый день
👥 Реферальная программа - приглашай друзей

<b>Поддержка:</b>
По всем вопросам обращайтесь: @support
    `.trim();
  },

  /**
   * Сообщение о мини-играх
   */
  miniGames: () => {
    return `
🎮 <b>Мини-игры</b>

Выбери игру, в которую хочешь сыграть:

🎮 <b>Bandit</b> — барабаны в приложении
🎲 <b>Кости</b> — быстрая игра
🎡 <b>Рулетка</b> — колесо и числа
🃏 <b>Блэкджек</b> — карты
💥 <b>Crash</b> — удержи множитель
🎯 <b>Колесо</b> — бонусное колесо

Минимальный вход: 10 монет
Максимальный вход: 10 000 монет

Удачи! 🍀
    `.trim();
  },

  /**
   * Сообщения об ошибках
   */
  errors: {
    generic: '❌ Произошла ошибка. Попробуйте позже.',
    insufficientBalance: '❌ Недостаточно средств на балансе.',
    invalidBet: '❌ Неверная сумма.',
    userNotFound: '❌ Пользователь не найден.',
    gameNotAvailable: '❌ Эта игра временно недоступна.',
    blocked: '🚫 Ваш аккаунт заблокирован. Обратитесь в поддержку.',
  },
};

/**
 * Форматирование времени
 */
export function formatTime(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}ч ${minutes}м`;
}

/**
 * Форматирование числа с разделителями
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
