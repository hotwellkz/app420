#!/bin/sh
set -e

# Целевой UID и GID для пользователя nodeuser (из Dockerfile)
TARGET_UID=${PUID:-1001}
TARGET_GID=${PGID:-1001}

# Функция для исправления прав доступа
fix_permissions() {
    local dir=$1
    if [ -d "$dir" ]; then
        echo "Исправление прав для: $dir"
        # Используем chown только если мы root, иначе просто проверяем
        if [ "$(id -u)" = "0" ]; then
            chown -R ${TARGET_UID}:${TARGET_GID} "$dir" 2>/dev/null || true
            chmod -R u+rwX,go+rX "$dir" 2>/dev/null || true
        fi
    else
        echo "Создание директории: $dir"
        if [ "$(id -u)" = "0" ]; then
            mkdir -p "$dir"
            chown -R ${TARGET_UID}:${TARGET_GID} "$dir"
            chmod -R u+rwX,go+rX "$dir"
        else
            mkdir -p "$dir"
        fi
    fi
}

# Если запущены как root, исправляем права и переключаемся на nodeuser
if [ "$(id -u)" = "0" ]; then
    echo "Запуск как root, исправление прав доступа..."
    
    # Исправляем права на критичные директории
    fix_permissions "/app/.wwebjs_auth"
    fix_permissions "/app/.wwebjs_cache"
    fix_permissions "/app/data"
    fix_permissions "/tmp/.X11-unix"
    
    # Переключаемся на пользователя nodeuser
    echo "Переключение на пользователя nodeuser (${TARGET_UID}:${TARGET_GID})..."
    exec su-exec nodeuser "$@"
else
    # Уже запущены как nodeuser, просто проверяем что директории существуют
    echo "Запуск как пользователь $(id -u):$(id -g)"
    mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/data /tmp/.X11-unix
    exec "$@"
fi
