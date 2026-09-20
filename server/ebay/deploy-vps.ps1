$ErrorActionPreference = 'Stop'

$root = 'C:\HDP\UltraHype\ebay'
$dst = Join-Path $root 'index.js'
$tmp = Join-Path $root 'index.new.js'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$bak = Join-Path $root "index.js.bak-$stamp"
$source = 'https://raw.githubusercontent.com/grandopenauto/ultrahype/b08a8f496e0649ee960554aab2d719e69c53fd3b/server/ebay/index.js'

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
if ($health.version -ne '0.4.1') { throw 'unexpected gateway version' }

Write-Output '=== PAGINATION QA ==='
foreach ($query in @('shoes','tools','cars')) {
  Write-Output ('QUERY=' + $query)
  $first = Invoke-RestMethod ("http://127.0.0.1:4317/api/commerce/ebay/search?q=$query&limit=12&offset=0") -TimeoutSec 120
  Write-Output ('FIRST_COUNT=' + $first.count)
  Write-Output ('FIRST_NEXT=' + [string]$first.nextOffset)
  Write-Output ('FIRST_MORE=' + $first.hasMore)
  Write-Output ('FIRST_SCANNED=' + $first.candidatesChecked)
  if ($first.hasMore -and $null -ne $first.nextOffset) {
    $second = Invoke-RestMethod ("http://127.0.0.1:4317/api/commerce/ebay/search?q=$query&limit=12&offset=$($first.nextOffset)") -TimeoutSec 120
    Write-Output ('SECOND_COUNT=' + $second.count)
    Write-Output ('SECOND_NEXT=' + [string]$second.nextOffset)
    Write-Output ('SECOND_MORE=' + $second.hasMore)
    Write-Output ('SECOND_START=' + $second.startOffset)
    if ($second.startOffset -ne $first.nextOffset) { throw 'cursor did not resume at requested source position' }
  }
}

Write-Output ('BACKUP=' + $bak)
Write-Output 'UH_EBAY_PAGINATION_FIX_DEPLOY_PASS'
