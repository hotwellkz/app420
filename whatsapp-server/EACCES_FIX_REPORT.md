# Отчет: Исправление проблемы EACCES с правами доступа WhatsApp сервера

## 📋 Резюме

**Проблема**: Контейнер `whatsapp-server` не мог записывать в директории `.wwebjs_auth` и `.wwebjs_cache` из-за ошибок прав доступа (EACCES).

**Решение**: Реализовано автоматическое исправление прав при старте контейнера через entrypoint скрипт + одноразовый скрипт для исправления прав на хосте.

**Статус**: ✅ Готово к применению

---

## 🔍 Диагностика (выполнено)

### Текущее состояние на сервере

**Расположение**: `/volume1/docker/whatsapp-server` (Synology)

**Права доступа (проверено)**:
```
.wwebjs_auth:    1001:1001 (775) ✅
.wwebjs_cache:   1001:1001 (775) ✅
data:            1001:1001 (775) ✅
```

**Пользователь в контейнере**: `nodeuser` (UID 1001, GID 1001)

**Проблема**: При создании новых файлов/директорий внутри volume права могли быть неправильными, что приводило к EACCES.

---

## ✅ Внесенные изменения

### 1. Создан entrypoint скрипт (`docker-entrypoint.sh`)

**Файл**: `whatsapp-server/docker-entrypoint.sh`

**Функционал**:
- Автоматически исправляет права на `/app/.wwebjs_auth`, `/app/.wwebjs_cache`, `/app/data` при старте
- Если контейнер запущен как root → исправляет права и переключается на `nodeuser`
- Если контейнер уже запущен как `nodeuser` → просто проверяет наличие директорий
- Использует переменные окружения `PUID` и `PGID` для гибкости

### 2. Обновлен Dockerfile

**Файл**: `whatsapp-server/Dockerfile`

**Изменения**:
- ✅ Добавлен пакет `su-exec` для безопасного переключения пользователя
- ✅ Скопирован `docker-entrypoint.sh` в образ
- ✅ Установлены права на entrypoint скрипт
- ✅ Убран `USER nodeuser` из Dockerfile (теперь это делает entrypoint)
- ✅ Обновлен `ENTRYPOINT` для использования entrypoint скрипта

**Ключевые строки**:
```dockerfile
RUN apk add --no-cache ... su-exec ...
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
```

### 3. Обновлен docker-compose.synology.yml

**Файл**: `whatsapp-server/docker-compose.synology.yml`

**Изменения**:
- ✅ Добавлены переменные окружения `PUID=1001` и `PGID=1001`
- ✅ Добавлен комментарий о том, что `user` не указывается (entrypoint сам переключится)

### 4. Обновлен docker-compose-synology-fixed.yml

**Файл**: `docker-compose-synology-fixed.yml`

**Изменения**:
- ✅ Исправлен путь `WHATSAPP_SESSION_PATH` с `/app/data/.wwebjs_auth` на `/app/.wwebjs_auth`
- ✅ Добавлены переменные `PUID=1001` и `PGID=1001`

### 5. Создан скрипт для одноразового исправления прав

**Файл**: `whatsapp-server/fix-permissions-on-host.sh`

**Функционал**:
- Останавливает контейнер
- Исправляет права на `.wwebjs_auth`, `.wwebjs_cache`, `data`
- Показывает текущие права после исправления
- Выводит инструкции для запуска

### 6. Создана документация

**Файлы**:
- `whatsapp-server/FIX_PERMISSIONS_GUIDE.md` - подробное руководство
- `whatsapp-server/EACCES_FIX_REPORT.md` - этот отчет

---

## 🚀 Инструкция по применению

### Вариант 1: Автоматическое исправление (рекомендуется)

```bash
cd /volume1/docker/whatsapp-server

# Остановить контейнер
sudo /usr/local/bin/docker stop whatsapp-server

# Пересобрать и запустить
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build

# Проверить логи
sudo /usr/local/bin/docker logs whatsapp-server --tail=50 -f
```

**Что произойдет**:
1. Контейнер пересоберется с новым entrypoint скриптом
2. При первом запуске entrypoint исправит права автоматически
3. Контейнер переключится на пользователя `nodeuser` и запустит приложение

### Вариант 2: Одноразовое исправление прав на хосте

Если нужно исправить права до пересборки:

```bash
cd /volume1/docker/whatsapp-server

# Сделать скрипт исполняемым
chmod +x fix-permissions-on-host.sh

# Запустить скрипт
sudo ./fix-permissions-on-host.sh
```

---

## 📊 Проверка после применения

### 1. Проверить логи контейнера

```bash
sudo /usr/local/bin/docker logs whatsapp-server --tail=200 | grep -iE "EACCES|permission|NOT_READY|ready|authenticated|entrypoint|исправление"
```

**Ожидаемый результат**:
- ❌ НЕТ строк с `EACCES` или `permission denied`
- ✅ Есть строки `Исправление прав для:` (из entrypoint скрипта)
- ✅ Есть строки `Переключение на пользователя nodeuser`
- ✅ Есть строки `ready` или `isClientReady=true`
- ✅ НЕТ `WhatsApp: NOT_READY` после успешной аутентификации

### 2. Проверить права на хосте

```bash
cd /volume1/docker/whatsapp-server
ls -la .wwebjs_auth .wwebjs_cache data
```

**Ожидаемый результат**:
```
drwxr-xr-x  1 1001 1001  ... .wwebjs_auth
drwxr-xr-x  1 1001 1001  ... .wwebjs_cache
drwxr-xr-x  1 1001 1001  ... data
```

### 3. Проверить права внутри контейнера

```bash
sudo /usr/local/bin/docker exec whatsapp-server id
sudo /usr/local/bin/docker exec whatsapp-server ls -la /app/.wwebjs_auth
```

**Ожидаемый результат**:
```
uid=1001(nodeuser) gid=1001(nodejs) groups=1001(nodejs)
drwxr-xr-x  1 nodeuser nodejs  ... /app/.wwebjs_auth
```

### 4. Проверить статус API

```bash
curl http://localhost:3002/health
# или
curl http://localhost:3002/api/status
```

**Ожидаемый результат**:
```json
{
  "status": "ok",
  "whatsapp": {
    "ready": true,
    "connected": true
  }
}
```

---

## 🔧 Технические детали

### Архитектура решения

```
┌─────────────────────────────────────────┐
│  Docker Container (запуск как root)    │
│                                         │
│  1. Entrypoint скрипт запускается      │
│  2. Исправляет права на volumes         │
│  3. Переключается на nodeuser (1001)   │
│  4. Запускает start.sh → server.js     │
└─────────────────────────────────────────┘
         │
         │ volumes mounted
         ▼
┌─────────────────────────────────────────┐
│  Host: /volume1/docker/whatsapp-server   │
│                                         │
│  .wwebjs_auth  → 1001:1001 (775)       │
│  .wwebjs_cache → 1001:1001 (775)       │
│  data          → 1001:1001 (775)       │
└─────────────────────────────────────────┘
```

### Переменные окружения

- `PUID=1001` - UID пользователя nodeuser
- `PGID=1001` - GID группы nodejs

Эти переменные используются entrypoint скриптом. Можно изменить при необходимости.

### Почему это работает "раз и навсегда"

1. **Entrypoint скрипт выполняется при каждом запуске** - права исправляются автоматически
2. **Контейнер запускается как root** - имеет права на chown
3. **После исправления прав переключение на nodeuser** - безопасность сохраняется
4. **Volumes монтируются с правильными правами** - новые файлы создаются с правильными правами

---

## 📝 Измененные файлы

1. ✅ `whatsapp-server/Dockerfile` - добавлен su-exec, entrypoint скрипт
2. ✅ `whatsapp-server/docker-compose.synology.yml` - добавлены PUID/PGID
3. ✅ `docker-compose-synology-fixed.yml` - исправлен путь, добавлены PUID/PGID
4. ✅ `whatsapp-server/docker-entrypoint.sh` - **новый файл**
5. ✅ `whatsapp-server/fix-permissions-on-host.sh` - **новый файл**
6. ✅ `whatsapp-server/FIX_PERMISSIONS_GUIDE.md` - **новый файл**
7. ✅ `whatsapp-server/EACCES_FIX_REPORT.md` - **новый файл** (этот)

---

## ⚠️ Важные замечания

1. **Не удаляйте `.wwebjs_auth`** - там хранится сессия WhatsApp. Удаление потребует повторной авторизации через QR-код.

2. **Можно безопасно очистить `.wwebjs_cache`** - это только кеш, не критичные данные.

3. **После пересборки образа** entrypoint скрипт автоматически исправит права при первом запуске.

4. **Если проблема сохраняется** - проверьте логи entrypoint скрипта и убедитесь, что контейнер запускается как root (по умолчанию).

---

## 🎯 Результат

После применения этих изменений:

- ✅ Проблема EACCES больше не должна возникать
- ✅ Права автоматически исправляются при каждом запуске
- ✅ Контейнер работает безопасно (не как root в runtime)
- ✅ Решение устойчиво к пересборкам и перезапускам

---

**Дата**: 2025-01-09  
**Автор**: DevOps/Backend инженер  
**Статус**: ✅ Готово к применению
