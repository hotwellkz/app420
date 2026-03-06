# Исправление проблемы с docker-compose на Synology

## Проблема

Ошибка: `parsing /volume1/docker/whatsapp-server/docker-compose.synology.yml: Top-level object must be a mapping`

**Причина:** Файл был пустым или поврежден при копировании.

## Решение

### 1. Проверьте файл на Synology:

```bash
ssh admin@192.168.100.222
cd /volume1/docker/whatsapp-server
cat docker-compose.synology.yml | head -20
```

Должно быть:
```yaml
version: '3.8'

services:
  whatsapp-server:
    build:
      context: .
      dockerfile: Dockerfile
    ...
```

### 2. Если файл пустой или поврежден, скопируйте вручную:

**Вариант A: Через File Station (DSM GUI)**
1. Откройте File Station на Synology
2. Перейдите в `/volume1/docker/whatsapp-server/`
3. Загрузите файл `docker-compose.synology.yml` из репозитория

**Вариант B: Через scp (с Windows):**
```powershell
scp whatsapp-server/docker-compose.synology.yml admin@192.168.100.222:/volume1/docker/whatsapp-server/
scp whatsapp-server/docker-compose.nginx.yml admin@192.168.100.222:/volume1/docker/whatsapp-server/
scp whatsapp-server/nginx/nginx.conf admin@192.168.100.222:/volume1/docker/whatsapp-server/nginx/
```

**Вариант C: Через git (если репозиторий на Synology):**
```bash
ssh admin@192.168.100.222
cd /volume1/docker/whatsapp-server
git pull
```

### 3. Создайте .env.production:

```bash
ssh admin@192.168.100.222
cd /volume1/docker/whatsapp-server

# Если есть env.production, скопируйте его
cp env.production .env.production

# Или создайте минимальный
cat > .env.production << EOF
FRONTEND_URL=https://2wix.ru
PORT=3000
NODE_ENV=production
WA_HEADLESS=true
WA_READY_TIMEOUT_MS=90000
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
EOF
```

### 4. Проверьте YAML синтаксис:

```bash
/usr/local/bin/docker compose -f docker-compose.synology.yml config
```

Если ошибок нет - файл валидный.

### 5. Запустите:

```bash
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build
```

---

## Быстрая проверка всех файлов

```bash
ssh admin@192.168.100.222
cd /volume1/docker/whatsapp-server

# Проверка файлов
ls -la docker-compose*.yml
ls -la nginx/nginx.conf
ls -la .env.production

# Проверка YAML
/usr/local/bin/docker compose -f docker-compose.synology.yml config > /dev/null && echo "OK" || echo "ERROR"
/usr/local/bin/docker compose -f docker-compose.nginx.yml config > /dev/null && echo "OK" || echo "ERROR"
```

---

## Если проблема сохраняется

1. **Проверьте кодировку файлов:**
```bash
file docker-compose.synology.yml
# Должно быть: ASCII text или UTF-8
```

2. **Проверьте права доступа:**
```bash
chmod 644 docker-compose.synology.yml
chmod 644 docker-compose.nginx.yml
chmod 644 nginx/nginx.conf
```

3. **Убедитесь, что нет скрытых символов:**
```bash
cat -A docker-compose.synology.yml | head -5
```

4. **Проверьте версию docker compose:**
```bash
/usr/local/bin/docker compose version
```

---

## Готовые команды для копирования (выполните на Windows)

```powershell
# Убедитесь, что вы в корне проекта
cd "C:\Users\studo\Downloads\app400-main (1)\app400-main"

# Копируйте файлы через scp
scp whatsapp-server/docker-compose.synology.yml admin@192.168.100.222:/volume1/docker/whatsapp-server/
scp whatsapp-server/docker-compose.nginx.yml admin@192.168.100.222:/volume1/docker/whatsapp-server/
scp whatsapp-server/nginx/nginx.conf admin@192.168.100.222:/volume1/docker/whatsapp-server/nginx/
```

Затем на Synology:
```bash
ssh admin@192.168.100.222
cd /volume1/docker/whatsapp-server
/usr/local/bin/docker compose -f docker-compose.synology.yml config
```
