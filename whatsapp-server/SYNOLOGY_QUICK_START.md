# Быстрый старт: Деплой на Synology

## Предварительные требования

✅ Synology x86_64 (проверено)
✅ Docker установлен и работает
✅ SSH доступ к Synology (admin@192.168.100.222)
✅ Папка `/volume1/docker/whatsapp-server` с кодом

---

## Быстрый деплой (все команды на Synology)

### 1. Подключитесь к Synology:

```bash
ssh admin@192.168.100.222
```

### 2. Перейдите в папку проекта:

```bash
cd /volume1/docker/whatsapp-server
```

### 3. Создайте .env.production (если нет):

```bash
cp .env.production.example .env.production
# Или скопируйте из env.production если он есть
```

**ВАЖНО:** Отредактируйте `.env.production` и заполните:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`  
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. Создайте Docker сеть:

```bash
/usr/local/bin/docker network create app400_net
```

### 5. Запустите whatsapp-server:

```bash
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build
```

### 6. Проверьте логи:

```bash
/usr/local/bin/docker logs -f whatsapp-server
```

Дождитесь сообщения о готовности (обычно 1-2 минуты).

### 7. Запустите nginx:

```bash
/usr/local/bin/docker compose -f docker-compose.nginx.yml up -d
```

### 8. Проверьте работу:

```bash
# Health check через nginx
curl http://localhost:8080/health

# Или напрямую к whatsapp-server (из другого контейнера)
/usr/local/bin/docker exec nginx-api-2wix wget -qO- http://whatsapp-server:3000/health
```

---

## Настройка VPS для проксирования

На VPS (159.255.37.158) добавьте в nginx конфигурацию:

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

Перезагрузите nginx на VPS:
```bash
nginx -t && systemctl reload nginx
```

---

## Проверка извне

После настройки VPS:

```bash
curl https://api.2wix.ru/health
```

Ожидаемый ответ:
```json
{"status":"ok","timestamp":"...","uptime":...,"server":{"ready":true,"version":"1.0.0"}}
```

---

## Управление

### Остановка:
```bash
cd /volume1/docker/whatsapp-server
/usr/local/bin/docker compose -f docker-compose.synology.yml stop
/usr/local/bin/docker compose -f docker-compose.nginx.yml stop
```

### Запуск:
```bash
/usr/local/bin/docker compose -f docker-compose.synology.yml start
/usr/local/bin/docker compose -f docker-compose.nginx.yml start
```

### Перезапуск:
```bash
/usr/local/bin/docker compose -f docker-compose.synology.yml restart
/usr/local/bin/docker compose -f docker-compose.nginx.yml restart
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
/usr/local/bin/docker logs whatsapp-server
```

### Порт занят:
```bash
netstat -tuln | grep 8080
```

### Проблемы с сетью:
```bash
/usr/local/bin/docker network inspect app400_net
```

---

## Чеклист

- [ ] `.env.production` создан и заполнен
- [ ] Docker сеть `app400_net` создана
- [ ] Контейнер `whatsapp-server` запущен
- [ ] Контейнер `nginx-api-2wix` запущен
- [ ] `curl http://localhost:8080/health` работает
- [ ] VPS настроен для проксирования
- [ ] `curl https://api.2wix.ru/health` работает извне
