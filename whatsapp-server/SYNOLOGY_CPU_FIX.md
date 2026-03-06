# Исправление ошибки CPU limits на Synology

## Проблема

Ошибка: `NanoCPUs can not be set, as your kernel does not support CPU CFS scheduler or the cgroup is not mounted`

**Причина:** Synology не поддерживает ограничение CPU через `cpus:` в docker-compose.

## Решение

Убрана строка `cpus: '1.5'` из `docker-compose.synology.yml`.

## Команда для запуска

```bash
cd /volume1/docker/whatsapp-server

# Запустите контейнер (CPU limits убраны)
sudo /usr/local/bin/docker compose -f docker-compose.synology.yml up -d

# Проверьте статус
sudo /usr/local/bin/docker ps | grep whatsapp-server
```

## Что изменено

- ❌ Убрано: `cpus: '1.5'`
- ✅ Оставлено: `mem_limit: 2g` и `mem_reservation: 1g` (память работает)

## Альтернатива: Ограничение CPU через Container Manager GUI

Если нужно ограничить CPU, используйте Container Manager GUI:
1. Откройте Container Manager
2. Выберите контейнер `whatsapp-server`
3. Редактировать → Ресурсы → Ограничить использование CPU

Но для большинства случаев это не требуется.

---

**Файл исправлен! Запускайте контейнер командой выше.**
