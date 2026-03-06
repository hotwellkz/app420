# Исправление прав доступа Docker на Synology

## Проблема

Ошибка: `permission denied while trying to connect to the Docker daemon socket`

**Причина:** Пользователь `admin` не в группе `docker` или не имеет прав на `/var/run/docker.sock`

## Решения

### Решение 1: Использовать sudo (БЫСТРОЕ)

Просто добавьте `sudo` перед командами docker:

```bash
cd /volume1/docker/whatsapp-server

# Создать сеть (уже сделано)
sudo /usr/local/bin/docker network create app400_net

# Запустить whatsapp-server
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build

# Проверить логи
sudo /usr/local/bin/docker logs -f whatsapp-server

# Запустить nginx
sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml up -d

# Проверить статус
sudo /usr/local/bin/docker ps
```

### Решение 2: Добавить пользователя в группу docker (ПОСТОЯННОЕ)

```bash
# Добавить пользователя в группу docker
sudo usermod -aG docker admin

# Проверить группы
groups admin

# Переподключиться через SSH (важно!)
exit
# Затем снова:
ssh admin@192.168.100.222

# Проверить права
ls -la /var/run/docker.sock
# Должно показывать группу docker с правами rw

# Теперь можно без sudo
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build
```

### Решение 3: Использовать Container Manager GUI (РЕКОМЕНДУЕТСЯ)

1. Откройте **Container Manager** на Synology
2. Перейдите в **Проекты**
3. Нажмите **Создать** → **Из файла**
4. Выберите файл: `/volume1/docker/whatsapp-server/docker-compose.synology.yml`
5. Название проекта: `whatsapp-server`
6. Нажмите **Создать** и **Запустить**

---

## Быстрый деплой с sudo

```bash
ssh admin@192.168.100.222
cd /volume1/docker/whatsapp-server

# 1. Сеть уже создана, проверяем
sudo /usr/local/bin/docker network ls | grep app400_net

# 2. Запускаем whatsapp-server
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d --build

# 3. Ждем 30 секунд и проверяем логи
sleep 30
sudo /usr/local/bin/docker logs whatsapp-server | tail -20

# 4. Если все OK, запускаем nginx
sudo /usr/local/bin/docker compose -f docker-compose.nginx.yml up -d

# 5. Проверяем health
curl http://localhost:8080/health
```

---

## Проверка после деплоя

```bash
# Статус контейнеров
sudo /usr/local/bin/docker ps | grep -E "whatsapp-server|nginx-api-2wix"

# Логи whatsapp-server
sudo /usr/local/bin/docker logs --tail 50 whatsapp-server

# Логи nginx
sudo /usr/local/bin/docker logs --tail 50 nginx-api-2wix

# Health check
curl http://localhost:8080/health

# Проверка сети
sudo /usr/local/bin/docker network inspect app400_net
```

---

## Если проблема сохраняется

1. **Проверьте, что Docker запущен:**
```bash
sudo systemctl status docker
# или
sudo /usr/local/bin/docker info
```

2. **Проверьте права на socket:**
```bash
ls -la /var/run/docker.sock
# Должно быть: srw-rw---- 1 root docker
```

3. **Перезапустите Docker (если нужно):**
```bash
sudo systemctl restart docker
```

---

## Рекомендация

**Используйте sudo** для всех docker команд на Synology, если пользователь не в группе docker. Это безопасно и работает сразу.

Или добавьте пользователя в группу docker один раз, и потом можно работать без sudo.
