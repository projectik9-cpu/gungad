#!/bin/bash

echo "========================================"
echo "  🎰 GunGad Casino Bot"
echo "========================================"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не найден!"
    echo "Установите Node.js с https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js найден"
node --version
echo ""

# Проверка зависимостей
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Ошибка установки зависимостей"
        exit 1
    fi
    echo "✅ Зависимости установлены"
    echo ""
fi

# Проверка .env файла
if [ ! -f ".env" ]; then
    echo "❌ Файл .env не найден!"
    exit 1
fi

echo "🚀 Запуск бота..."
echo ""
echo "========================================"
echo "  Для остановки нажмите Ctrl+C"
echo "========================================"
echo ""

node src/index.js
