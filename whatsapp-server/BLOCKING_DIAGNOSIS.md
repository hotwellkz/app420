# Диагностика блокировки WhatsApp CDN

## Результаты диагностики

### Обнаруженные проблемы:

1. **DNS сервер: 192.168.100.1 (роутер)**
   - Используется DNS роутера, который может фильтровать запросы
   - Рекомендуется переключиться на публичные DNS (Google/Cloudflare)

2. **Запросы к WhatsApp CDN блокируются**
   - Тестовый запрос к `mmx-ds.cdn.whatsapp.net` возвращает 404
   - Это может быть блокировка на уровне роутера/провайдера

3. **Windows Defender Network Protection**
   - Статус не определен (возможно включен)
   - Может блокировать запросы к неизвестным доменам

## Пошаговое решение

### ШАГ 1: Изменить DNS на публичные серверы

**PowerShell (от администратора):**
```powershell
# Получить имя интерфейса
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Select-Object Name

# Изменить DNS (замените "Ethernet" на имя вашего интерфейса)
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses "8.8.8.8","8.8.4.4"

# Или Cloudflare
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses "1.1.1.1","1.0.0.1"
```

**Проверка:**
```powershell
Get-DnsClientServerAddress -InterfaceAlias "Ethernet"
```

**Тест:**
```powershell
nslookup web.whatsapp.com 8.8.8.8
Invoke-WebRequest -Uri "https://mmx-ds.cdn.whatsapp.net" -Method HEAD
```

---

### ШАГ 2: Отключить Windows Defender Network Protection (временно для теста)

**PowerShell (от администратора):**
```powershell
# Проверить текущий статус
Get-MpPreference | Select-Object DisableNetworkProtection

# Отключить (только для диагностики!)
Set-MpPreference -DisableNetworkProtection $true

# После теста включить обратно
Set-MpPreference -DisableNetworkProtection $false
```

**⚠️ ВНИМАНИЕ:** Это временно отключает защиту сети. Используйте только для диагностики!

---

### ШАГ 3: Добавить исключения в Windows Defender

**Через UI:**
1. Откройте **Windows Security** (Безопасность Windows)
2. Перейдите в **App & browser control** (Управление приложениями и браузером)
3. Нажмите **Reputation-based protection settings** (Настройки защиты на основе репутации)
4. Прокрутите вниз до **Exclusions** (Исключения)
5. Добавьте исключения:
   - `*.whatsapp.net`
   - `*.whatsapp.com`
   - `web.whatsapp.com`

**PowerShell (от администратора):**
```powershell
# Добавить исключение для домена
Add-MpPreference -ExclusionPath "*.whatsapp.net"
Add-MpPreference -ExclusionPath "*.whatsapp.com"
Add-MpPreference -ExclusionPath "web.whatsapp.com"

# Проверить исключения
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
```

---

### ШАГ 4: Проверить настройки роутера

1. **Войдите в настройки роутера:**
   - Обычно: `http://192.168.1.1` или `http://192.168.0.1` или `http://192.168.100.1`
   - Логин/пароль: обычно на наклейке роутера

2. **Проверьте следующие разделы:**
   - **Parental Control** (Родительский контроль)
   - **Website Filtering** (Фильтрация сайтов)
   - **DNS Filtering** (DNS фильтрация)
   - **Content Filtering** (Фильтрация контента)

3. **Добавьте исключения:**
   - `*.whatsapp.net`
   - `*.whatsapp.com`
   - `web.whatsapp.com`

4. **Или временно отключите фильтрацию** для теста

---

### ШАГ 5: Проверить Chrome policies

1. Откройте Chrome
2. Перейдите на `chrome://policy`
3. Проверьте следующие политики:
   - `URLBlocklist` - список заблокированных URL
   - `URLWhitelist` - список разрешенных URL
   - `BlockThirdPartyCookies` - блокировка сторонних cookies
   - `DefaultCookiesSetting` - настройки cookies

4. Если есть блокирующие политики для WhatsApp - удалите их или добавьте исключения

**PowerShell (проверка политик Chrome):**
```powershell
Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Google\Chrome" -ErrorAction SilentlyContinue | Format-List
Get-ItemProperty -Path "HKCU:\Software\Policies\Google\Chrome" -ErrorAction SilentlyContinue | Format-List
```

---

### ШАГ 6: Проверить hosts файл

**PowerShell:**
```powershell
Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" | Select-String -Pattern "whatsapp"
```

Если найдены записи, блокирующие WhatsApp - удалите их (требуются права администратора)

---

### ШАГ 7: Проверить Firewall

**PowerShell (от администратора):**
```powershell
# Проверить правила для Chrome
Get-NetFirewallApplicationFilter | Where-Object {$_.Program -like "*chrome*"}

# Добавить правило для Chrome (если нужно)
New-NetFirewallRule -DisplayName "WhatsApp Chrome" -Direction Outbound -Program "C:\Program Files\Google\Chrome\Application\chrome.exe" -Action Allow
```

---

## Тестирование после изменений

1. **Перезапустите сетевой адаптер:**
```powershell
Restart-NetAdapter -Name "Ethernet"
```

2. **Проверьте DNS:**
```powershell
nslookup web.whatsapp.com
nslookup cdn.whatsapp.net
```

3. **Тестовый запрос:**
```powershell
Invoke-WebRequest -Uri "https://mmx-ds.cdn.whatsapp.net" -Method HEAD
```

4. **Перезапустите WhatsApp сервер:**
```powershell
cd whatsapp-server
npm run dev
```

5. **Проверьте логи** на наличие `ERR_ABORTED` или `blocked`

---

## Автоматический скрипт исправления

Используйте `fix-whatsapp-blocking.ps1` (требуются права администратора):

```powershell
# Все исправления
.\fix-whatsapp-blocking.ps1 -All

# Только DNS
.\fix-whatsapp-blocking.ps1 -FixDNS

# Только Network Protection (временно)
.\fix-whatsapp-blocking.ps1 -DisableNetworkProtection

# Только Firewall
.\fix-whatsapp-blocking.ps1 -AddFirewallException
```

---

## Итоговая проверка

После всех изменений выполните:

```powershell
.\diagnose-blocking.ps1
```

**Ожидаемый результат:**
- ✓ DNS резолвит WhatsApp домены
- ✓ Тестовый запрос к CDN успешен
- ✓ Нет блокирующих записей в hosts
- ✓ Network Protection настроен правильно

---

## Если проблема сохраняется

1. **Проверьте логи Puppeteer** в `whatsapp-server/debug/`
2. **Проверьте логи сервера** на наличие `[WA_PAGE][requestfailed]`
3. **Попробуйте запустить Chrome вручную** с теми же аргументами, что использует Puppeteer
4. **Проверьте, не блокирует ли провайдер** WhatsApp домены на уровне сети

---

## Контакты для диагностики

Если проблема не решена, соберите следующую информацию:

1. Вывод `.\diagnose-blocking.ps1`
2. Логи из `whatsapp-server/debug/wa_stuck_*.png/html`
3. Логи сервера с `[WA_PAGE][requestfailed]`
4. Результат `chrome://policy`
