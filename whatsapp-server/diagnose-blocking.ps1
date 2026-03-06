# WhatsApp CDN Blocking Diagnostic Script
# Checks and fixes blocking of WhatsApp CDN requests

Write-Host "=== WhatsApp CDN Blocking Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# 1. DNS Check
Write-Host "[1] Checking DNS resolution..." -ForegroundColor Yellow
$dnsTest1 = Resolve-DnsName -Name "web.whatsapp.com" -Type A -ErrorAction SilentlyContinue
$dnsTest2 = Resolve-DnsName -Name "cdn.whatsapp.net" -Type A -ErrorAction SilentlyContinue

if ($dnsTest1) {
    Write-Host "  OK web.whatsapp.com resolves: $($dnsTest1[0].IPAddress)" -ForegroundColor Green
} else {
    Write-Host "  FAIL web.whatsapp.com does NOT resolve" -ForegroundColor Red
}

if ($dnsTest2) {
    Write-Host "  OK cdn.whatsapp.net resolves: $($dnsTest2[0].IPAddress)" -ForegroundColor Green
} else {
    Write-Host "  WARN cdn.whatsapp.net does not resolve (normal for base domain)" -ForegroundColor Yellow
}

# 2. Current DNS Servers
Write-Host ""
Write-Host "[2] Current DNS servers:" -ForegroundColor Yellow
$dnsServers = Get-DnsClientServerAddress | Where-Object {$_.AddressFamily -eq 2} | Select-Object -First 1
if ($dnsServers) {
    Write-Host "  Interface: $($dnsServers.InterfaceAlias)" -ForegroundColor Cyan
    Write-Host "  DNS: $($dnsServers.ServerAddresses -join ', ')" -ForegroundColor Cyan
}

# 3. Windows Defender Network Protection
Write-Host ""
Write-Host "[3] Checking Windows Defender Network Protection..." -ForegroundColor Yellow
$mpPref = Get-MpPreference -ErrorAction SilentlyContinue
if ($mpPref) {
    Write-Host "  DisableNetworkProtection: $($mpPref.DisableNetworkProtection)" -ForegroundColor Cyan
    Write-Host "  DisableWebProtection: $($mpPref.DisableWebProtection)" -ForegroundColor Cyan
    if ($mpPref.DisableNetworkProtection -eq $false) {
        Write-Host "  WARN Network Protection is enabled - may block requests" -ForegroundColor Yellow
    }
}

# 4. SmartScreen Check
Write-Host ""
Write-Host "[4] Checking SmartScreen..." -ForegroundColor Yellow
$smartScreen = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer" -Name "SmartScreenEnabled" -ErrorAction SilentlyContinue
if ($smartScreen) {
    Write-Host "  SmartScreenEnabled: $($smartScreen.SmartScreenEnabled)" -ForegroundColor Cyan
    if ($smartScreen.SmartScreenEnabled -ne "Off") {
        Write-Host "  WARN SmartScreen is enabled - may block requests" -ForegroundColor Yellow
    }
}

# 5. Proxy Check
Write-Host ""
Write-Host "[5] Checking Proxy settings..." -ForegroundColor Yellow
$winHttpProxy = netsh winhttp show proxy
Write-Host "  $winHttpProxy" -ForegroundColor Cyan

# 6. Hosts File Check
Write-Host ""
Write-Host "[6] Checking hosts file..." -ForegroundColor Yellow
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$hostsContent = Get-Content $hostsPath -ErrorAction SilentlyContinue
$whatsappInHosts = $hostsContent | Select-String -Pattern "whatsapp"
if ($whatsappInHosts) {
    Write-Host "  WARN Found WhatsApp entries in hosts:" -ForegroundColor Yellow
    $whatsappInHosts | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
} else {
    Write-Host "  OK No blocking entries for WhatsApp" -ForegroundColor Green
}

# 7. Test Request to WhatsApp CDN
Write-Host ""
Write-Host "[7] Test request to WhatsApp CDN..." -ForegroundColor Yellow
try {
    $testUrl = "https://mmx-ds.cdn.whatsapp.net"
    $response = Invoke-WebRequest -Uri $testUrl -Method HEAD -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  OK Request successful: Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "  FAIL Request blocked: $errorMsg" -ForegroundColor Red
    if ($errorMsg -like "*ERR_ABORTED*" -or $errorMsg -like "*blocked*") {
        Write-Host "  WARN Blocking detected at network/browser level" -ForegroundColor Yellow
    }
}

# 8. Recommendations
Write-Host ""
Write-Host "=== RECOMMENDATIONS ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If requests are blocked, follow these steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "A) Change DNS to Google/Cloudflare:" -ForegroundColor Cyan
if ($dnsServers) {
    Write-Host "   Set-DnsClientServerAddress -InterfaceAlias '$($dnsServers.InterfaceAlias)' -ServerAddresses '8.8.8.8','8.8.4.4'"
} else {
    Write-Host "   Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ServerAddresses '8.8.8.8','8.8.4.4'"
}
Write-Host ""
Write-Host "B) Disable Network Protection (temporary for testing):" -ForegroundColor Cyan
Write-Host "   Set-MpPreference -DisableNetworkProtection `$true"
Write-Host "   (WARNING: This disables protection. Use only for diagnostics!)"
Write-Host ""
Write-Host "C) Add exclusion in Windows Defender for WhatsApp domains:" -ForegroundColor Cyan
Write-Host "   - Open: Windows Security -> App & browser control"
Write-Host "   - Reputation-based protection -> Exclusions"
Write-Host "   - Add: *.whatsapp.net, *.whatsapp.com"
Write-Host ""
Write-Host "D) Check router/provider blocking:" -ForegroundColor Cyan
Write-Host "   - Login to router settings (usually 192.168.1.1 or 192.168.0.1)"
Write-Host "   - Check: Parental Control, Website Filtering, DNS Filtering"
Write-Host "   - Add exceptions for *.whatsapp.net and *.whatsapp.com"
Write-Host ""
Write-Host "E) Check Chrome policies:" -ForegroundColor Cyan
Write-Host "   Open chrome://policy in browser and check blocking policies"
Write-Host ""
