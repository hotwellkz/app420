# Деплой whatsapp-server на Synology DSM

## Архитектура

```
Internet → VPS (159.255.37.158) → Synology (192.168.100.222)
                                    ├── nginx-proxy (порт 8080)
                                    └── whatsapp-server (внутренний порт 3000)
```

**Важно:** 
- whatsapp-server НЕ публикует порт наружу
- Доступ только через nginx-proxy внутри Docker сети `app400_net`
- SSL терминируется на VPS (или на Synology, если настроено)

---

## Шаг 1: Подготовка файлов на Synology

### 1.1 Проверка структуры папок

```bash
ssh admin@192.168.100.222 "ls -la /volume1/docker/whatsapp-server/"
```

### 1.2 Создание необходимых файлов

Файлы уже должны быть в репозитории:
- `docker-compose.synology.yml` - для whatsapp-server
- `docker-compose.nginx.yml` - для nginx reverse proxy
- `nginx/nginx.conf` - конфигурация nginx
- `.env.production.example` - пример переменных окружения

### 1.3 Создание .env.production

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && cp .env.production.example .env.production"
```

Затем отредактируйте `.env.production` и заполните реальные значения:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Шаг 2: Создание Docker сети

```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker network create app400_net"
```

Проверка:
```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker network ls | grep app400_net"
```

---

## Шаг 3: Запуск whatsapp-server

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build"
```

Проверка логов:
```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker logs -f whatsapp-server"
```

Проверка статуса:
```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker ps | grep whatsapp-server"
```

---

## Шаг 4: Запуск nginx reverse proxy

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml up -d"
```

Проверка:
```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker ps | grep nginx-api-2wix"
```

---

## Шаг 5: Настройка VPS для проксирования

На VPS (159.255.37.158) нужно настроить nginx для проксирования `api.2wix.ru` на Synology.

### 5.1 Если SSL терминируется на VPS:

Добавьте в конфигурацию nginx на VPS:

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

### 5.2 Если SSL нужен на Synology:

1. Получите SSL сертификат для `api.2wix.ru`
2. Скопируйте на Synology в `/volume1/docker/whatsapp-server/nginx/ssl/`
3. Раскомментируйте SSL секцию в `nginx/nginx.conf`
4. Измените порт в `docker-compose.nginx.yml` на `8443:443`

---

## Шаг 6: Проверка работы

### 6.1 Health check внутри Synology:

```bash
ssh admin@192.168.100.222 "curl http://localhost:8080/health"
```

### 6.2 Health check через nginx:

```bash
ssh admin@192.168.100.222 "curl http://whatsapp-server:3000/health"
```

### 6.3 Проверка извне (после настройки VPS):

```bash
curl https://api.2wix.ru/health
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": ...,
  "server": {
    "ready": true,
    "version": "1.0.0"
  }
}
```

---

## Шаг 7: Мониторинг и логи

### Просмотр логов whatsapp-server:

```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker logs -f whatsapp-server"
```

### Просмотр логов nginx:

```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker logs -f nginx-api-2wix"
```

### Проверка статуса контейнеров:

```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker ps -a"
```

### Проверка сетей:

```bash
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker network inspect app400_net"
```

---

## Управление

### Остановка:

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.synology.yml stop"
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml stop"
```

### Запуск:

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.synology.yml start"
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml start"
```

### Перезапуск:

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.synology.yml restart"
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml restart"
```

### Обновление:

```bash
ssh admin@192.168.100.222 "cd /volume1/docker/whatsapp-server && git pull && sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build"
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

## Troubleshooting

### Проблема: Контейнер не запускается

```bash
# Проверьте логи
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker logs whatsapp-server"

# Проверьте ресурсы
ssh admin@192.168.100.222 "free -h && df -h"
```

### Проблема: Порт занят

```bash
# Проверьте, что порт 8080 свободен
ssh admin@192.168.100.222 "sudo netstat -tuln | grep 8080"
```

### Проблема: Сеть не создается

```bash
# Удалите и создайте заново
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker network rm app400_net"
ssh admin@192.168.100.222 "sudo /usr/local/bin/docker network create app400_net"
```

---

## Чеклист проверки

- [ ] Docker сеть `app400_net` создана
- [ ] Контейнер `whatsapp-server` запущен и здоров
- [ ] Контейнер `nginx-api-2wix` запущен
- [ ] `curl http://localhost:8080/health` возвращает `{"status":"ok"}`
- [ ] `curl http://whatsapp-server:3000/health` работает из nginx контейнера
- [ ] Логи whatsapp-server без ошибок
- [ ] Логи nginx без ошибок
- [ ] После настройки VPS: `curl https://api.2wix.ru/health` работает
- [ ] WebSocket соединения работают (проверьте в браузере)

---

## Что НЕ трогали

✅ Существующие контейнеры не изменены
✅ Существующие сети не изменены
✅ Существующие порты не изменены
✅ Добавлена только новая сеть `app400_net`
✅ Добавлены только новые контейнеры: `whatsapp-server` и `nginx-api-2wix`

---

## Что добавили

✅ Docker сеть `app400_net`
✅ Контейнер `whatsapp-server` (внутренний порт 3000)
✅ Контейнер `nginx-api-2wix` (порт 8080 для проксирования)
✅ Конфигурация nginx для проксирования api.2wix.ru
✅ Автозапуск контейнеров при перезагрузке (`restart: unless-stopped`)
