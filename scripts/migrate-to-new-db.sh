#!/bin/bash
# Скрипт создания новой БД и миграции всех данных
# Использование: ./scripts/migrate-to-new-db.sh [имя_новой_бд]

set -e

# Загружаем DATABASE_URL из .env
if [ -f .env ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')
elif [ -f .env.local ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' .env.local 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')
fi
export DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL не задан в .env"
  exit 1
fi

# Парсим URL: postgresql://user:password@host:port/dbname
# Упрощённый парсинг
NEW_DB_NAME="${1:-kamni_db}"
TEMP_DUMP="/tmp/kamni_migration_$$.sql"

# Извлекаем параметры подключения (без имени БД) для создания новой
# postgresql://user:pass@host:port/ -> подключение к postgres
BASE_URL="${DATABASE_URL%/*}"  # убираем /dbname
OLD_DB="${DATABASE_URL##*/}"   # последняя часть после /
OLD_DB="${OLD_DB%%\?*}"        # убираем ?schema=public и т.д.

echo "📦 Текущая БД: $OLD_DB"
echo "📦 Новая БД: $NEW_DB_NAME"
echo ""

# 1. Создаём новую БД (подключаемся к postgres)
echo "1️⃣ Создаём новую базу данных $NEW_DB_NAME..."
psql "$BASE_URL/postgres" -tc "SELECT 1 FROM pg_database WHERE datname = '$NEW_DB_NAME'" | grep -q 1 && {
  echo "   База $NEW_DB_NAME уже существует. Удалить и пересоздать? (y/n)"
  read -r confirm
  if [ "$confirm" = "y" ]; then
    psql "$BASE_URL/postgres" -c "DROP DATABASE $NEW_DB_NAME;"
    psql "$BASE_URL/postgres" -c "CREATE DATABASE $NEW_DB_NAME;"
  else
    echo "   Пропускаем создание."
  fi
} || psql "$BASE_URL/postgres" -c "CREATE DATABASE $NEW_DB_NAME;"

# 2. Дамп из старой БД (убираем ?schema= для pg_dump)
echo ""
echo "2️⃣ Экспортируем данные из $OLD_DB..."
DUMP_URL="${DATABASE_URL%%\?*}"
pg_dump "$DUMP_URL" --no-owner --no-acl -F p -f "$TEMP_DUMP"

# 3. Восстанавливаем в новую БД
echo ""
echo "3️⃣ Импортируем в $NEW_DB_NAME..."
NEW_URL="${BASE_URL}/${NEW_DB_NAME}"
psql "$NEW_URL" -f "$TEMP_DUMP"

# 4. Очищаем
rm -f "$TEMP_DUMP"

echo ""
echo "✅ Миграция завершена!"
echo ""
echo "Новая БД: $NEW_DB_NAME"
echo "URL для .env: $NEW_URL"
echo ""
echo "Обновите DATABASE_URL в .env и перезапустите приложение."
