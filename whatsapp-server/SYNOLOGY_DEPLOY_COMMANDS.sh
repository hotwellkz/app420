#!/bin/bash
# Скрипт для деплоя whatsapp-server на Synology
# Выполняйте команды по очереди на Synology через SSH

set -e

echo "=== Деплой whatsapp-server на Synology ==="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка прав
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}Внимание: Некоторые команды требуют sudo${NC}"
fi

echo -e "${GREEN}[1/7] Проверка Docker...${NC}"
/usr/local/bin/docker --version || { echo -e "${RED}Docker не найден!${NC}"; exit 1; }

echo -e "${GREEN}[2/7] Создание Docker сети app400_net...${NC}"
/usr/local/bin/docker network create app400_net 2>/dev/null || echo "Сеть уже существует"

echo -e "${GREEN}[3/7] Проверка структуры папок...${NC}"
cd /volume1/docker/whatsapp-server || { echo -e "${RED}Папка не найдена!${NC}"; exit 1; }

if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}Создание .env.production из примера...${NC}"
    cp .env.production.example .env.production 2>/dev/null || cp env.production .env.production 2>/dev/null || {
        echo -e "${RED}Файл .env.production не найден! Создайте его вручную.${NC}"
        exit 1
    }
    echo -e "${YELLOW}⚠️  ВАЖНО: Отредактируйте .env.production и заполните реальные значения!${NC}"
fi

echo -e "${GREEN}[4/7] Сборка и запуск whatsapp-server...${NC}"
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build

echo -e "${GREEN}[5/7] Ожидание запуска whatsapp-server (30 сек)...${NC}"
sleep 30

echo -e "${GREEN}[6/7] Проверка health endpoint...${NC}"
for i in {1..10}; do
    if curl -f http://localhost:3000/health 2>/dev/null || /usr/local/bin/docker exec whatsapp-server curl -f http://localhost:3000/health 2>/dev/null; then
        echo -e "${GREEN}✅ whatsapp-server работает!${NC}"
        break
    else
        echo "Попытка $i/10..."
        sleep 5
    fi
done

echo -e "${GREEN}[7/7] Запуск nginx reverse proxy...${NC}"
/usr/local/bin/docker compose -f docker-compose.nginx.yml up -d

echo ""
echo -e "${GREEN}=== Деплой завершен! ===${NC}"
echo ""
echo "Проверка статуса:"
/usr/local/bin/docker ps | grep -E "whatsapp-server|nginx-api-2wix"
echo ""
echo "Просмотр логов:"
echo "  /usr/local/bin/docker logs -f whatsapp-server"
echo "  /usr/local/bin/docker logs -f nginx-api-2wix"
echo ""
echo "Проверка health:"
echo "  curl http://localhost:8080/health"
