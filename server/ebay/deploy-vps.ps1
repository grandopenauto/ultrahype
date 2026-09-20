$ErrorActionPreference = 'Stop'

$root = 'C:\HDP\UltraHype\ebay'
$dst = Join-Path $root 'index.js'
$tmp = Join-Path $root 'index.new.js'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$bak = Join-Path $root "index.js.bak-$stamp"
$source = 'https://raw.githubusercontent.com/grandopenauto/ultrahype/1ebddc8d3117edf5baa6f2e8225fc0726961cd30/server/ebay/index.js'

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
if ($health.version -ne '0.5.0') { throw 'unexpected gateway version' }

Write-Output '=== CATEGORY QA ==='
$categories = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/categories' -TimeoutSec 120
$categoryRows = @($categories.categories)
Write-Output ('CATEGORY_TREE=' + $categories.categoryTreeId)
Write-Output ('CATEGORY_VERSION=' + $categories.categoryTreeVersion)
Write-Output ('CATEGORY_COUNT=' + $categoryRows.Count)
if ($categoryRows.Count -lt 1) { throw 'no marketplace categories returned' }
foreach ($category in $categoryRows | Select-Object -First 5) {
  Write-Output ('CATEGORY=' + $category.id + '|' + $category.name)
}

Write-Output '=== ACTIVITY QA ==='
$activityBody = @{ type='search'; sessionId='deploy-qa'; query='gateway qa' } | ConvertTo-Json -Compress
$activity = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/activity/event' -Method Post -ContentType 'application/json' -Body $activityBody -TimeoutSec 20
Write-Output ('ACTIVITY_OK=' + $activity.ok)
if (-not $activity.ok) { throw 'activity event endpoint failed' }
$trending = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/activity/trending?window_minutes=15&limit=3' -TimeoutSec 20
Write-Output ('TRENDING_SIGNAL=' + $trending.signal)

Write-Output '=== SEARCH QA ==='
$first = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/search?q=tools&limit=12&offset=0' -TimeoutSec 120
Write-Output ('SEARCH_COUNT=' + $first.count)
Write-Output ('SEARCH_NEXT=' + [string]$first.nextOffset)
if ($first.hasMore -and $null -ne $first.nextOffset) {
  $second = Invoke-RestMethod ("http://127.0.0.1:4317/api/commerce/ebay/search?q=tools&limit=12&offset=$($first.nextOffset)") -TimeoutSec 120
  Write-Output ('SEARCH_SECOND_COUNT=' + $second.count)
  if ($second.startOffset -ne $first.nextOffset) { throw 'pagination cursor mismatch' }
}

Write-Output ('BACKUP=' + $bak)
Write-Output 'UH_MARKETPLACE_GATEWAY_DEPLOY_PASS'
