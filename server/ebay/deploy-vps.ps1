$ErrorActionPreference = 'Stop'

$root = 'C:\HDP\UltraHype\ebay'
$dst = Join-Path $root 'index.js'
$tmp = Join-Path $root 'index.new.js'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$bak = Join-Path $root "index.js.bak-$stamp"
$source = 'https://raw.githubusercontent.com/grandopenauto/ultrahype/bae7e8ed95ff371ec0ddd29821cd2c16a71495e7/server/ebay/index.js'

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
if ($health.version -ne '0.4.0') { throw 'unexpected gateway version' }

Write-Output '=== CLEAN SEARCH QA ==='
$result = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/search?q=sneakers&limit=12&offset=0' -TimeoutSec 120
$items = @($result.items)
$imageCount = @($items | Where-Object { $_.image }).Count
$coreCount = @($items | Where-Object { $_.quality.coreComplete -eq $true }).Count
Write-Output ('COUNT=' + $items.Count)
Write-Output ('SOURCE_TOTAL=' + $result.total)
Write-Output ('RETRIEVABLE_TOTAL=' + $result.retrievableTotal)
Write-Output ('PAGES_SCANNED=' + $result.pagesScanned)
Write-Output ('CANDIDATES=' + $result.candidatesChecked)
Write-Output ('FILTERED=' + $result.filteredOut)
Write-Output ('HAS_MORE=' + $result.hasMore)
Write-Output ('NEXT_OFFSET=' + $result.nextOffset)
Write-Output ('WITH_IMAGE=' + $imageCount)
Write-Output ('CORE_COMPLETE=' + $coreCount)
if ($items.Count -ne $imageCount) { throw 'one or more returned items lack images' }
if ($items.Count -ne $coreCount) { throw 'one or more returned items fail core quality' }
foreach ($item in $items) {
  Write-Output ('ITEM=' + $item.title)
  Write-Output ('IMG=' + [string]$item.image)
  Write-Output ('PRICE=' + [string]$item.price.value + ' ' + [string]$item.price.currency)
  Write-Output ('CONDITION=' + [string]$item.condition)
}

Write-Output ('BACKUP=' + $bak)
Write-Output 'UH_EBAY_CLEAN_PAGINATION_DEPLOY_PASS'
