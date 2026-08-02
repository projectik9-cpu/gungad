@echo off
chcp 65001 >nul
echo ========================================
echo   🎰 GunGad Casino Bot
echo ========================================
echo.

REM Проверка Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js не найден!
    echo Установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js найден
node --version
echo.

REM Проверка зависимостей
if not exist "node_modules\" (
    echo 📦 Установка зависимостей...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки зависимостей
        pause
        exit /b 1
    )
    echo ✅ Зависимости установлены
    echo.
)

REM Проверка .env файла
if not exist ".env" (
    echo ❌ Файл .env не найден!
    pause
    exit /b 1
)

echo 🚀 Запуск бота...
echo.
echo ========================================
echo   Для остановки нажмите Ctrl+C
echo ========================================
echo.

node src/index.js

pause
