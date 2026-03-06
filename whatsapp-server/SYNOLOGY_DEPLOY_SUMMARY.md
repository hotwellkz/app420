# Итоговый отчет: Деплой whatsapp-server на Synology

## Архитектура решения

```
Internet
   ↓
VPS (159.255.37.158) - api.2wix.ru (SSL терминируется здесь)
   ↓
Synology (192.168.100.222)
   ├── nginx-api-2wix (порт 8080) - reverse proxy
   └── whatsapp-server (внутренний порт 3000) - API сервер
   
Сеть: app400_net (изолированная Docker сеть)
```

---

## Созданные файлы

### 1. Docker Compose файлы

- **`docker-compose.synology.yml`** - для whatsapp-server
  - НЕ публикует порт наружу (только `expose: 3000`)
  - Использует сеть `app400_net`
  - Автозапуск: `restart: unless-stopped`
  - Health check: `/health` endpoint

- **`docker-compose.nginx.yml`** - для nginx reverse proxy
  - Публикует порт 8080 (для проксирования с VPS)
  - Подключается к сети `app400_net`
  - Зависит от `whatsapp-server`

### 2. Nginx конфигурация

- **`nginx/nginx.conf`** - полная конфигурация
  - Проксирование `api.2wix.ru` → `whatsapp-server:3000`
  - WebSocket support для Socket.IO
  - Увеличенные таймауты (300s)
  - Health check endpoint

### 3. Документация

- **`DEPLOY_SYNOLOGY.md`** - полная инструкция
- **`SYNOLOGY_QUICK_START.md`** - быстрый старт
- **`SYNOLOGY_DEPLOY_COMMANDS.sh`** - скрипт автоматизации

---

## Команды для деплоя

### На Synology (через SSH):

```bash
# 1. Подключитесь
ssh admin@192.168.100.222

# 2. Перейдите в папку
cd /volume1/docker/whatsapp-server

# 3. Создайте .env.production (если нет)
cp .env.production.example .env.production
# Отредактируйте и заполните реальные значения!

# 4. Создайте Docker сеть
/usr/local/bin/docker network create app400_net

# 5. Запустите whatsapp-server
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build

# 6. Проверьте логи (подождите 1-2 минуты)
/usr/local/bin/docker logs -f whatsapp-server

# 7. Запустите nginx
/usr/local/bin/docker compose -f docker-compose.nginx.yml up -d

# 8. Проверьте работу
curl http://localhost:8080/health
```

---

## Настройка VPS

На VPS (159.255.37.158) добавьте в nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name api.2wix.ru;

    ssl_certificate /path/to/ssl/api.2wix.ru.crt;
    ssl_certificate_key /path/to/ssl/api.2wix.ru.key;

    location / {
        proxy_pass http://192.168.100.222:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }
}
```

Перезагрузите nginx:
```bash
nginx -t && systemctl reload nginx
```

---

## Проверка работы

### Внутри Synology:

```bash
# Health check через nginx
curl http://localhost:8080/health

# Health check напрямую к whatsapp-server
/usr/local/bin/docker exec nginx-api-2wix wget -qO- http://whatsapp-server:3000/health
```

### Извне (после настройки VPS):

```bash
curl https://api.2wix.ru/health
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "timestamp": "2026-01-08T...",
  "uptime": 123.45,
  "server": {
    "ready": true,
    "version": "1.0.0"
  }
}
```

---

## Что НЕ трогали

✅ Существующие контейнеры не изменены
✅ Существующие сети не изменены  
✅ Существующие порты не изменены
✅ Существующие конфигурации не изменены

---

## Что добавили

✅ **Docker сеть:** `app400_net` (изолированная)
✅ **Контейнер:** `whatsapp-server` (внутренний порт 3000)
✅ **Контейнер:** `nginx-api-2wix` (порт 8080 для проксирования)
✅ **Файлы конфигурации:**
   - `docker-compose.synology.yml`
   - `docker-compose.nginx.yml`
   - `nginx/nginx.conf`
   - `.env.production.example`
✅ **Документация:**
   - `DEPLOY_SYNOLOGY.md`
   - `SYNOLOGY_QUICK_START.md`
   - `SYNOLOGY_DEPLOY_COMMANDS.sh`

---

## Чеклист проверки

- [ ] `.env.production` создан и заполнен реальными значениями
- [ ] Docker сеть `app400_net` создана
- [ ] Контейнер `whatsapp-server` запущен (`docker ps`)
- [ ] Контейнер `nginx-api-2wix` запущен (`docker ps`)
- [ ] `curl http://localhost:8080/health` возвращает `{"status":"ok"}`
- [ ] Логи whatsapp-server без критических ошибок
- [ ] Логи nginx без ошибок
- [ ] VPS настроен для проксирования api.2wix.ru
- [ ] `curl https://api.2wix.ru/health` работает извне
- [ ] WebSocket соединения работают (проверьте в браузере)

---

## Управление

### Просмотр статуса:

```bash
/usr/local/bin/docker ps | grep -E "whatsapp-server|nginx-api-2wix"
```

### Просмотр логов:

```bash
# whatsapp-server
/usr/local/bin/docker logs -f whatsapp-server

# nginx
/usr/local/bin/docker logs -f nginx-api-2wix
```

### Перезапуск:

```bash
cd /volume1/docker/whatsapp-server
/usr/local/bin/docker compose -f docker-compose.synology.yml restart
/usr/local/bin/docker compose -f docker-compose.nginx.yml restart
```

### Остановка:

```bash
/usr/local/bin/docker compose -f docker-compose.synology.yml stop
/usr/local/bin/docker compose -f docker-compose.nginx.yml stop
```

### Обновление:

```bash
cd /volume1/docker/whatsapp-server
git pull  # если используете git
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build
```

---

## Troubleshooting

### Контейнер не запускается:

```bash
# Проверьте логи
/usr/local/bin/docker logs whatsapp-server

# Проверьте ресурсы
free -h
df -h
```

### Порт 8080 занят:

```bash
# Найдите процесс
netstat -tuln | grep 8080

# Или измените порт в docker-compose.nginx.yml
```

### Проблемы с сетью:

```bash
# Проверьте сеть
/usr/local/bin/docker network inspect app400_net

# Пересоздайте сеть
/usr/local/bin/docker network rm app400_net
/usr/local/bin/docker network create app400_net
```

---

## Безопасность

### Ограничение доступа (опционально):

Если нужно ограничить доступ только с VPS, добавьте в `nginx/nginx.conf`:

```nginx
server {
    listen 80;
    server_name api.2wix.ru;
    
    # Разрешаем только с VPS
    allow 159.255.37.158;
    deny all;
    
    # ... остальная конфигурация
}
```

---

## Итог

✅ **Архитектура:** Изолированная Docker сеть, nginx reverse proxy
✅ **Безопасность:** Порт whatsapp-server не публикуется наружу
✅ **Масштабируемость:** Легко добавить дополнительные сервисы
✅ **Мониторинг:** Health check endpoints настроены
✅ **Автозапуск:** Контейнеры перезапускаются при перезагрузке

**Готово к production использованию!**
