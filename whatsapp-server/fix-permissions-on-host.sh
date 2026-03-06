#!/bin/bash
# Скрипт для одноразового исправления прав доступа на хосте
# Использование: ./fix-permissions-on-host.sh [путь_к_проекту]
# Пример: ./fix-permissions-on-host.sh /volume1/docker/whatsapp-server

set -e

# Целевой UID и GID (соответствуют nodeuser в контейнере)
TARGET_UID=1001
TARGET_GID=1001

# Определяем путь к проекту
if [ -n "$1" ]; then
    PROJECT_DIR="$1"
else
    # Пытаемся определить автоматически
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$SCRIPT_DIR"
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Ошибка: Директория не найдена: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

echo "=========================================="
echo "Исправление прав доступа для WhatsApp сервера"
echo "=========================================="
echo "Директория проекта: $PROJECT_DIR"
echo "Целевой UID:GID: $TARGET_UID:$TARGET_GID"
echo ""

# Проверяем, что мы root или имеем права sudo
if [ "$(id -u)" != "0" ]; then
    echo "Внимание: Скрипт должен выполняться с правами root или через sudo"
    echo "Попытка использовать sudo..."
    SUDO_CMD="sudo"
else
    SUDO_CMD=""
fi

# Останавливаем контейнер, если он запущен
echo "Проверка запущенного контейнера..."
if $SUDO_CMD docker ps -q -f name=whatsapp-server | grep -q .; then
    echo "Остановка контейнера whatsapp-server..."
    $SUDO_CMD docker stop whatsapp-server || true
    echo "Контейнер остановлен"
else
    echo "Контейнер не запущен"
fi

# Список директорий для исправления
DIRS=(
    ".wwebjs_auth"
    ".wwebjs_cache"
    "data"
)

echo ""
echo "Исправление прав доступа..."

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ] || [ -e "$dir" ]; then
        echo "  -> $dir"
        $SUDO_CMD chown -R ${TARGET_UID}:${TARGET_GID} "$dir" || {
            echo "    Предупреждение: Не удалось изменить владельца для $dir"
        }
        $SUDO_CMD chmod -R u+rwX,go+rX "$dir" || {
            echo "    Предупреждение: Не удалось изменить права для $dir"
        }
        
        # Показываем текущие права
        if [ -d "$dir" ]; then
            OWNER=$(stat -c "%U:%G (%u:%g)" "$dir" 2>/dev/null || echo "unknown")
            PERMS=$(stat -c "%a" "$dir" 2>/dev/null || echo "unknown")
            echo "    Владелец: $OWNER, Права: $PERMS"
        fi
    else
        echo "  -> $dir (не существует, будет создан при запуске контейнера)"
    fi
done

echo ""
echo "=========================================="
echo "Исправление прав завершено!"
echo "=========================================="
echo ""
echo "Теперь можно запустить контейнер:"
echo "  cd $PROJECT_DIR"
echo "  sudo docker compose -f docker-compose.synology.yml up -d --build"
echo ""
