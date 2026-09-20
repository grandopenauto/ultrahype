$ErrorActionPreference = 'Stop'

$root = 'C:\HDP\UltraHype\ebay'
$dst = Join-Path $root 'index.js'
$tmp = Join-Path $root 'index.new.js'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$bak = Join-Path $root "index.js.bak-$stamp"
$source = 'https://raw.githubusercontent.com/grandopenauto/ultrahype/main/server/ebay/index.js'

Write-Output '=== DOWNLOAD ==='
Invoke-WebRequest $source -OutFile $tmp -UseBasicParsing

Write-Output '=== SYNTAX CHECK ==='
& node --check $tmp
if ($LASTEXITCODE -ne 0) { throw 'node syntax check failed' }

Write-Output '=== BACKUP + INSTALL ==='
Copy-Item $dst $bak -Force
Move-Item $tmp $dst -Force

Write-Output '=== RESTART ==='
Restart-Service 'HDP-UltraHype-eBay'
Start-Sleep -Seconds 3

Write-Output '=== HEALTH ==='
$health = Invoke-RestMethod 'http://127.0.0.1:4317/health' -TimeoutSec 20
Write-Output ('VERSION=' + $health.version)
if ($health.version -ne '0.3.0') { throw 'unexpected gateway version' }

Write-Output '=== SEARCH QA ==='
$result = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/search?q=sneakers&limit=8' -TimeoutSec 90
$items = @($result.items)
$imageCount = @($items | Where-Object { $_.image }).Count
Write-Output ('COUNT=' + $items.Count)
Write-Output ('FILTERED=' + $result.filteredOut)
Write-Output ('WITH_IMAGE=' + $imageCount)
foreach ($item in $items) {
  Write-Output ('ITEM=' + $item.title)
  Write-Output ('IMG=' + [string]$item.image)
  Write-Output ('END=' + [string]$item.itemEndDate)
}

Write-Output ('BACKUP=' + $bak)
Write-Output 'UH_EBAY_DEPLOY_PASS'
