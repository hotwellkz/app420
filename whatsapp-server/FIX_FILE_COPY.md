# Исправление проблемы с копированием docker-compose.synology.yml

## Проблема

Файл `docker-compose.synology.yml` на Synology пустой или поврежден, что вызывает ошибку "no service selected".

## Решение: Скопируйте файл вручную

### Вариант 1: Через File Station (DSM GUI)

1. Откройте **File Station** на Synology
2. Перейдите в `/volume1/docker/whatsapp-server/`
3. Загрузите файл `docker-compose.synology.yml` из локального репозитория

### Вариант 2: Через scp (с Windows PowerShell)

```powershell
# Убедитесь, что вы в корне проекта
cd "C:\Users\studo\Downloads\app400-main (1)\app400-main"

# Скопируйте файл
scp whatsapp-server/docker-compose.synology.yml admin@192.168.100.222:/volume1/docker/whatsapp-server/
```

### Вариант 3: Создайте файл напрямую на Synology

Выполните на Synology через SSH:

```bash
cd /volume1/docker/whatsapp-server

# Удалите поврежденный файл
rm docker-compose.synology.yml

# Создайте файл заново (скопируйте содержимое из репозитория)
nano docker-compose.synology.yml
# Или используйте vi:
vi docker-compose.synology.yml
```

**Содержимое файла** (скопируйте полностью):

```yaml
version: '3.8'

services:
  whatsapp-server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: whatsapp-server
    restart: unless-stopped
    expose:
      - "3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
      - WHATSAPP_SESSION_PATH=/app/data/.wwebjs_auth
      - CHROME_FLAGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --single-process --no-zygote
      - CHROME_DEVEL_SANDBOX=false
      - CHROME_NO_SANDBOX=true
      - DISPLAY=:99
      - PUPPETEER_DISABLE_HEADLESS_WARNING=true
      - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
      - WA_HEADLESS=true
      - WA_READY_TIMEOUT_MS=90000
      - FRONTEND_URL=${FRONTEND_URL:-https://2wix.ru}
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data:rw
      - ./.wwebjs_auth:/app/.wwebjs_auth:rw
      - ./.wwebjs_cache:/app/.wwebjs_cache:rw
    networks:
      - app400_net
    cap_add:
      - SYS_ADMIN
      - NET_ADMIN
    security_opt:
      - seccomp:unconfined
    shm_size: 2g
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    mem_limit: 2g
    mem_reservation: 1g
    cpus: '1.5'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 45s
      timeout: 30s
      retries: 5
      start_period: 120s

networks:
  app400_net:
    external: true
    name: app400_net
```

### Вариант 4: Через git (если репозиторий на Synology)

```bash
cd /volume1/docker/whatsapp-server
git pull
# Или если файл в другом месте:
git checkout whatsapp-server/docker-compose.synology.yml
```

## После копирования файла

```bash
cd /volume1/docker/whatsapp-server

# Проверьте файл
wc -l docker-compose.synology.yml
# Должно быть: 63 строки

# Проверьте YAML
/usr/local/bin/docker compose -f docker-compose.synology.yml config > /dev/null && echo "✅ Valid" || echo "❌ Invalid"

# Запустите
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d
```

## Быстрая проверка

```bash
# Должно показать 63 строки
wc -l /volume1/docker/whatsapp-server/docker-compose.synology.yml

# Должно показать "YAML valid"
/usr/local/bin/docker compose -f /volume1/docker/whatsapp-server/docker-compose.synology.yml config > /dev/null && echo "✅ Valid"
```
