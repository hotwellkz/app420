# Руководство по исправлению проблемы EACCES с правами доступа

## 🔍 Проблема

Ошибки вида:
- `EACCES: permission denied`
- `failed to remove /app/.wwebjs_auth after 12 attempts (EACCES)`
- `WhatsApp: NOT_READY`
- `authenticated but isClientReady=false`
- Зависание на LOADING 99%

**Причина**: Контейнерный пользователь (nodeuser, UID 1001) не имеет прав на запись в volume с сессией и кешем.

## ✅ Решение (раз и навсегда)

### Вариант 1: Автоматическое исправление (рекомендуется)

Исправления уже внесены в код. После пересборки контейнера проблема должна исчезнуть автоматически.

**Что было сделано:**
1. ✅ Создан `docker-entrypoint.sh` - автоматически исправляет права при старте
2. ✅ Обновлен `Dockerfile` - добавлен `su-exec` и entrypoint скрипт
3. ✅ Обновлен `docker-compose.synology.yml` - добавлены переменные `PUID` и `PGID`

**Действия:**
```bash
cd /volume1/docker/whatsapp-server

# Остановить контейнер
sudo /usr/local/bin/docker stop whatsapp-server

# Пересобрать и запустить
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build

# Проверить логи
sudo /usr/local/bin/docker logs whatsapp-server --tail=50 -f
```

### Вариант 2: Одноразовое исправление прав на хосте

Если автоматическое исправление не сработало, выполните одноразовое исправление:

```bash
cd /volume1/docker/whatsapp-server

# Сделать скрипт исполняемым
chmod +x fix-permissions-on-host.sh

# Запустить скрипт (он остановит контейнер, исправит права и покажет инструкции)
sudo ./fix-permissions-on-host.sh

# Или указать путь явно
sudo ./fix-permissions-on-host.sh /volume1/docker/whatsapp-server
```

**Что делает скрипт:**
1. Останавливает контейнер `whatsapp-server`
2. Устанавливает владельца `1001:1001` для директорий:
   - `.wwebjs_auth`
   - `.wwebjs_cache`
   - `data`
3. Устанавливает права `u+rwX,go+rX` (755 для директорий, 644 для файлов)

### Вариант 3: Ручное исправление

Если скрипты недоступны, выполните вручную:

```bash
cd /volume1/docker/whatsapp-server

# Остановить контейнер
sudo /usr/local/bin/docker stop whatsapp-server

# Исправить права
sudo chown -R 1001:1001 .wwebjs_auth .wwebjs_cache data
sudo chmod -R u+rwX,go+rX .wwebjs_auth .wwebjs_cache data

# Проверить права
ls -la .wwebjs_auth .wwebjs_cache data

# Запустить контейнер
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d
```

## 🔧 Как это работает

### Entrypoint скрипт (`docker-entrypoint.sh`)

При каждом запуске контейнера:
1. Если контейнер запущен как `root` (по умолчанию):
   - Исправляет права на `/app/.wwebjs_auth`, `/app/.wwebjs_cache`, `/app/data`
   - Переключается на пользователя `nodeuser` (UID 1001) через `su-exec`
2. Если контейнер уже запущен как `nodeuser`:
   - Просто проверяет, что директории существуют

### Переменные окружения

- `PUID=1001` - UID пользователя nodeuser
- `PGID=1001` - GID группы nodejs

Эти переменные используются entrypoint скриптом для определения целевого пользователя.

## 📊 Проверка после исправления

### 1. Проверить логи контейнера

```bash
sudo /usr/local/bin/docker logs whatsapp-server --tail=200 | grep -iE "EACCES|permission|NOT_READY|ready|authenticated"
```

**Ожидаемый результат:**
- ❌ НЕТ строк с `EACCES` или `permission denied`
- ✅ Есть строки `ready` или `isClientReady=true`
- ✅ НЕТ `WhatsApp: NOT_READY` после успешной аутентификации

### 2. Проверить права на хосте

```bash
cd /volume1/docker/whatsapp-server
ls -la .wwebjs_auth .wwebjs_cache data
```

**Ожидаемый результат:**
```
drwxr-xr-x  1 1001 1001  ... .wwebjs_auth
drwxr-xr-x  1 1001 1001  ... .wwebjs_cache
drwxr-xr-x  1 1001 1001  ... data
```

### 3. Проверить статус API

```bash
curl http://localhost:3002/health
# или
curl http://localhost:3002/api/status
```

**Ожидаемый результат:**
```json
{
  "status": "ok",
  "whatsapp": {
    "ready": true,
    "connected": true
  }
}
```

## 🚨 Если проблема сохраняется

1. **Проверьте, что контейнер запущен как root** (по умолчанию):
   ```bash
   sudo /usr/local/bin/docker inspect whatsapp-server | grep -A 5 '"User"'
   ```
   Должно быть пусто или `""` (root)

2. **Проверьте, что entrypoint скрипт выполняется**:
   ```bash
   sudo /usr/local/bin/docker logs whatsapp-server | grep -i "entrypoint\|исправление\|переключение"
   ```

3. **Проверьте права внутри контейнера**:
   ```bash
   sudo /usr/local/bin/docker exec whatsapp-server ls -la /app/.wwebjs_auth
   sudo /usr/local/bin/docker exec whatsapp-server id
   ```

4. **Убедитесь, что volumes смонтированы правильно**:
   ```bash
   sudo /usr/local/bin/docker inspect whatsapp-server | grep -A 10 '"Mounts"'
   ```

## 📝 Технические детали

- **Пользователь в контейнере**: `nodeuser` (UID 1001, GID 1001)
- **Группа в контейнере**: `nodejs` (GID 1001)
- **Права на директории**: `755` (rwxr-xr-x)
- **Права на файлы**: `644` (rw-r--r--)

## 🔄 После пересборки образа

После любых изменений в `Dockerfile` или `docker-compose.synology.yml`:

```bash
cd /volume1/docker/whatsapp-server
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build
```

Entrypoint скрипт автоматически исправит права при первом запуске.
