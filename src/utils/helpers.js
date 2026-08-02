/**
 * Вспомогательные функции
 */

/**
 * Задержка выполнения
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Генерация случайного числа в диапазоне
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Генерация случайного числа с плавающей точкой
 */
export function randomFloat(min, max, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return parseFloat(value.toFixed(decimals));
}

/**
 * Выбор случайного элемента из массива
 */
export function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Перемешивание массива (Fisher-Yates shuffle)
 */
export function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Форматирование числа с разделителями тысяч
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Форматирование валюты
 */
export function formatCurrency(amount, currency = '💰') {
  return `${formatNumber(amount)} ${currency}`;
}

/**
 * Форматирование времени (миллисекунды -> читаемый формат)
 */
export function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}д ${hours % 24}ч`;
  }
  if (hours > 0) {
    return `${hours}ч ${minutes % 60}м`;
  }
  if (minutes > 0) {
    return `${minutes}м ${seconds % 60}с`;
  }
  return `${seconds}с`;
}

/**
 * Расчёт процента
 */
export function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return ((value / total) * 100).toFixed(2);
}

/**
 * Расчёт множителя выигрыша
 */
export function calculateMultiplier(bet, win) {
  if (bet === 0) return 0;
  return (win / bet).toFixed(2);
}

/**
 * Проверка, является ли значение числом
 */
export function isNumber(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Безопасное преобразование в число
 */
export function toNumber(value, defaultValue = 0) {
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Ограничение числа в диапазоне
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Генерация уникального ID
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Проверка, прошло ли определённое время
 */
export function hasTimePassed(lastTime, intervalMs) {
  if (!lastTime) return true;
  const now = new Date();
  const last = new Date(lastTime);
  return now - last >= intervalMs;
}

/**
 * Получение времени до следующего события
 */
export function getTimeUntil(lastTime, intervalMs) {
  if (!lastTime) return 0;
  const now = new Date();
  const last = new Date(lastTime);
  const elapsed = now - last;
  const remaining = intervalMs - elapsed;
  return remaining > 0 ? remaining : 0;
}

/**
 * Escape HTML символов
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Truncate текста с многоточием
 */
export function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength - 3) + '...';
}

/**
 * Капитализация первой буквы
 */
export function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Получение случайного emoji из массива
 */
export function randomEmoji(emojis) {
  return randomElement(emojis);
}

/**
 * Проверка валидности email (базовая)
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Глубокое копирование объекта
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce функция
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle функция
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
