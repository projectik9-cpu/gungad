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
🎰 <b>Добро пожаловать в GunGad Casino!</b> 🎰

Привет, <b>${user.first_name}</b>! 👋

Мы рады видеть тебя в нашем казино! На твой счёт уже зачислено <b>${user.balance} монет</b> 💰

<b>Что ты можешь сделать:</b>
🎰 Открыть веб-приложение казино
🎮 Играть в мини-игры прямо в боте
💰 Получать ежедневные бонусы
👥 Приглашать друзей и получать награды
📊 Отслеживать свою статистику

<b>Нажми на кнопку ниже, чтобы открыть полную версию казино!</b> ⬇️
      `.trim();
    } else {
      return `
🎰 <b>С возвращением в GunGad Casino!</b> 🎰

Рады видеть тебя снова, <b>${user.first_name}</b>! 👋

Твой текущий баланс: <b>${user.balance} монет</b> 💰

<b>Открой веб-приложение и продолжай играть!</b> ⬇️
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
💵 Всего поставлено: <b>${user.total_bet_amount}</b>
💎 Всего выиграно: <b>${user.total_win_amount}</b>

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
ℹ️ <b>Помощь - GunGad Casino</b>

<b>Основные команды:</b>
/start - Запуск бота
/balance - Проверить баланс
/profile - Посмотреть профиль
/games - Список мини-игр
/bonus - Получить ежедневный бонус
/ref - Реферальная программа
/help - Эта справка

<b>Как играть:</b>
1️⃣ Нажми на кнопку "🎰 Открыть GunGad Casino"
2️⃣ Выбери игру в веб-приложении
3️⃣ Делай ставки и выигрывай! 💰

<b>Мини-игры в боте:</b>
🎰 Слоты - классические игровые автоматы
🎲 Кости - бросай кости и выигрывай
🎡 Рулетка - ставь на число или цвет
🃏 Блэкджек - набери 21 очко
💥 Crash - останови игру до краха
🎯 Колесо - крути колесо фортуны

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

🎰 <b>Слоты</b> - Классические игровые автоматы
🎲 <b>Кости</b> - Простая и быстрая игра на удачу
🎡 <b>Рулетка</b> - Ставь на число или цвет
🃏 <b>Блэкджек</b> - Карточная игра против дилера
💥 <b>Crash</b> - Останови игру до краха
🎯 <b>Колесо</b> - Крути колесо фортуны

<b>Минимальная ставка:</b> 10 монет
<b>Максимальная ставка:</b> 10,000 монет

Удачи! 🍀
    `.trim();
  },

  /**
   * Сообщения об ошибках
   */
  errors: {
    generic: '❌ Произошла ошибка. Попробуйте позже.',
    insufficientBalance: '❌ Недостаточно средств на балансе.',
    invalidBet: '❌ Неверная сумма ставки.',
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
