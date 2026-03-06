# Проверка статуса деплоя на Synology

## Текущий статус

✅ **Сборка образа:** Успешно завершена (232.5 секунды)
✅ **Docker сеть:** `app400_net` создана
✅ **YAML конфигурация:** Исправлена (сеть помечена как external: true)
⚠️ **Контейнер:** Нужно проверить статус

## Команды для проверки (выполните на Synology)

```bash
cd /volume1/docker/whatsapp-server

# 1. Проверьте статус контейнера
sudo /usr/local/bin/docker ps -a | grep whatsapp-server

# 2. Если контейнер не запущен, запустите его
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d

# 3. Проверьте логи
sudo /usr/local/bin/docker logs --tail 50 whatsapp-server

# 4. Проверьте health endpoint (из контейнера)
sudo /usr/local/bin/docker exec whatsapp-server curl -f http://localhost:3000/health

# 5. Проверьте подключение к сети
sudo /usr/local/bin/docker network inspect app400_net | grep -A 5 whatsapp-server
```

## Если контейнер не запущен

```bash
# Запустите с исправленной конфигурацией
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d

# Проверьте логи через 30 секунд
sleep 30
sudo /usr/local/bin/docker logs whatsapp-server | tail -30
```

## Запуск nginx (после успешного запуска whatsapp-server)

```bash
# Убедитесь, что whatsapp-server работает
sudo /usr/local/bin/docker exec whatsapp-server curl -f http://localhost:3000/health

# Если OK, запустите nginx
sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml up -d

# Проверьте статус обоих контейнеров
sudo /usr/local/bin/docker ps | grep -E "whatsapp-server|nginx-api-2wix"

# Проверьте health через nginx
curl http://localhost:8080/health
```

## Ожидаемый результат

После успешного запуска:

1. **Контейнер whatsapp-server:**
   - Статус: `Up` (работает)
   - Логи: без критических ошибок
   - Health: `{"status":"ok",...}`

2. **Контейнер nginx-api-2wix:**
   - Статус: `Up` (работает)
   - Порт: `8080:80`
   - Health: доступен через `http://localhost:8080/health`

3. **Сеть app400_net:**
   - Оба контейнера подключены
   - Могут общаться по именам (`whatsapp-server:3000`)

## Troubleshooting

### Контейнер не запускается:

```bash
# Проверьте логи
sudo /usr/local/bin/docker logs whatsapp-server

# Проверьте ресурсы
free -h
df -h

# Пересоздайте контейнер
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml down
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d
```

### Health check не работает:

```bash
# Проверьте, что сервер запущен внутри контейнера
sudo /usr/local/bin/docker exec whatsapp-server ps aux | grep node

# Проверьте порт
sudo /usr/local/bin/docker exec whatsapp-server netstat -tuln | grep 3000

# Проверьте логи приложения
sudo /usr/local/bin/docker logs whatsapp-server | grep -i error
```

### Проблемы с сетью:

```bash
# Проверьте подключение контейнера к сети
sudo /usr/local/bin/docker network inspect app400_net

# Переподключите контейнер
sudo /usr/local/bin/docker network disconnect app400_net whatsapp-server
sudo /usr/local/bin/docker network connect app400_net whatsapp-server
```
