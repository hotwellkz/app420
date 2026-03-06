# Скрипт для исправления блокировки WhatsApp CDN
# ВНИМАНИЕ: Выполняйте с правами администратора!

param(
    [switch]$FixDNS,
    [switch]$DisableNetworkProtection,
    [switch]$AddFirewallException,
    [switch]$All
)

if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ОШИБКА: Скрипт требует прав администратора!" -ForegroundColor Red
    Write-Host "Запустите PowerShell от имени администратора и повторите." -ForegroundColor Yellow
    exit 1
}

Write-Host "=== Исправление блокировки WhatsApp CDN ===" -ForegroundColor Cyan
Write-Host ""

if ($All -or $FixDNS) {
    Write-Host "[1] Изменение DNS на Google (8.8.8.8, 8.8.4.4)..." -ForegroundColor Yellow
    $interfaces = Get-NetAdapter | Where-Object {$_.Status -eq "Up"}
    foreach ($iface in $interfaces) {
        try {
            Set-DnsClientServerAddress -InterfaceAlias $iface.Name -ServerAddresses "8.8.8.8","8.8.4.4"
            Write-Host "  ✓ DNS изменен для интерфейса: $($iface.Name)" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Ошибка для $($iface.Name): $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Write-Host "  ⚠ Перезапустите сетевой адаптер или перезагрузите ПК для применения изменений" -ForegroundColor Yellow
    Write-Host ""
}

if ($All -or $DisableNetworkProtection) {
    Write-Host "[2] Отключение Windows Defender Network Protection..." -ForegroundColor Yellow
    Write-Host "  ⚠ ВНИМАНИЕ: Это временно отключает защиту сети!" -ForegroundColor Yellow
    $confirm = Read-Host "  Продолжить? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        try {
            Set-MpPreference -DisableNetworkProtection $true
            Write-Host "  ✓ Network Protection отключен" -ForegroundColor Green
            Write-Host "  ⚠ Не забудьте включить обратно после теста!" -ForegroundColor Yellow
        } catch {
            Write-Host "  ✗ Ошибка: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Пропущено" -ForegroundColor Gray
    }
    Write-Host ""
}

if ($All -or $AddFirewallException) {
    Write-Host "[3] Добавление исключения в Firewall для Chrome..." -ForegroundColor Yellow
    $chromePaths = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome SxS\Application\chrome.exe"
    )
    
    foreach ($chromePath in $chromePaths) {
        if (Test-Path $chromePath) {
            try {
                # Проверяем, существует ли правило
                $existingRule = Get-NetFirewallApplicationFilter | Where-Object {$_.Program -eq $chromePath}
                if (-not $existingRule) {
                    New-NetFirewallRule -DisplayName "WhatsApp Chrome" -Direction Outbound -Program $chromePath -Action Allow -Profile Any | Out-Null
                    Write-Host "  ✓ Правило добавлено для: $chromePath" -ForegroundColor Green
                } else {
                    Write-Host "  ✓ Правило уже существует для: $chromePath" -ForegroundColor Green
                }
            } catch {
                Write-Host "  ✗ Ошибка для $chromePath : $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    Write-Host ""
}

Write-Host "=== РУЧНЫЕ ДЕЙСТВИЯ ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Windows Security -> App & browser control:" -ForegroundColor Yellow
Write-Host "   - Reputation-based protection -> Exclusions"
Write-Host "   - Добавьте исключения для:"
Write-Host "     * C:\Program Files\Google\Chrome\Application\chrome.exe"
Write-Host "     * C:\Users\$env:USERNAME\AppData\Local\Google\Chrome SxS\Application\chrome.exe"
Write-Host ""
Write-Host "2. Проверьте роутер (обычно 192.168.1.1 или 192.168.0.1):" -ForegroundColor Yellow
Write-Host "   - Отключите Parental Control / Website Filtering"
Write-Host "   - Или добавьте исключения для *.whatsapp.net и *.whatsapp.com"
Write-Host ""
Write-Host "3. Проверьте chrome://policy в браузере" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. После изменений перезапустите WhatsApp сервер" -ForegroundColor Yellow
Write-Host ""
