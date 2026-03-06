#!/bin/bash
# Скрипт для деплоя whatsapp-server на Synology
# Используйте sudo для всех команд

set -e

echo "=== Деплой whatsapp-server на Synology ==="
echo ""

cd /volume1/docker/whatsapp-server

# 1. Проверка YAML
echo "[1/6] Проверка YAML..."
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml config > /dev/null && echo "✅ YAML valid" || { echo "❌ YAML invalid"; exit 1; }

# 2. Создание сети (если не существует)
echo "[2/6] Проверка Docker сети..."
if sudo /usr/local/bin/docker network ls | grep -q app400_net; then
    echo "✅ Сеть app400_net уже существует"
else
    echo "Создание сети app400_net..."
    sudo /usr/local/bin/docker network create app400_net
    echo "✅ Сеть создана"
fi

# 3. Проверка .env.production
echo "[3/6] Проверка .env.production..."
if [ -f .env.production ]; then
    echo "✅ .env.production существует"
else
    echo "⚠️  .env.production не найден! Создайте его из env.production"
    if [ -f env.production ]; then
        cp env.production .env.production
        echo "✅ Создан из env.production"
    else
        echo "❌ Файл env.production тоже не найден!"
        exit 1
    fi
fi

# 4. Запуск whatsapp-server
echo "[4/6] Запуск whatsapp-server..."
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build
echo "✅ whatsapp-server запущен"

# 5. Ожидание запуска
echo "[5/6] Ожидание запуска (30 сек)..."
sleep 30

# Проверка логов
echo "Последние логи:"
sudo /usr/local/bin/docker logs --tail 20 whatsapp-server

# 6. Запуск nginx
echo "[6/6] Запуск nginx..."
sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml up -d
echo "✅ nginx запущен"

echo ""
echo "=== Деплой завершен! ==="
echo ""
echo "Проверка статуса:"
sudo /usr/local/bin/docker ps | grep -E "whatsapp-server|nginx-api-2wix"
echo ""
echo "Health check:"
curl -s http://localhost:8080/health | head -5 || echo "Health check недоступен (подождите еще немного)"
echo ""
echo "Логи:"
echo "  sudo /usr/local/bin/docker logs -f whatsapp-server"
echo "  sudo /usr/local/bin/docker logs -f nginx-api-2wix"
