param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d{10}$')]
  [string]$CampaignId
)

$ErrorActionPreference = 'Stop'

$root = 'C:\HDP\UltraHype\ebay'
$path = Join-Path $root 'index.js'
$envPath = Join-Path $root '.env'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$backup = "$path.bak-epn-$stamp"
$envBackup = "$envPath.bak-epn-$stamp"
Copy-Item $path $backup -Force
Copy-Item $envPath $envBackup -Force

try {
  $envText = Get-Content $envPath -Raw
  if ($envText -match '(?m)^EPN_CAMPAIGN_ID=') {
    $envText = [regex]::Replace($envText, '(?m)^EPN_CAMPAIGN_ID=.*$', "EPN_CAMPAIGN_ID=$CampaignId")
  } else {
    if (-not $envText.EndsWith([Environment]::NewLine)) { $envText += [Environment]::NewLine }
    $envText += "EPN_CAMPAIGN_ID=$CampaignId" + [Environment]::NewLine
  }
  Set-Content -Path $envPath -Value $envText -Encoding UTF8

  $s = Get-Content $path -Raw
  $nl = [Environment]::NewLine

  if ($s -notmatch 'const EPN_CAMPAIGN_ID') {
    $needle = "const MARKETPLACE = process.env.EBAY_MARKETPLACE_ID || 'EBAY_US';"
    if (-not $s.Contains($needle)) { throw 'marketplace constant marker not found' }
    $s = $s.Replace($needle, $needle + $nl + "const EPN_CAMPAIGN_ID = process.env.EPN_CAMPAIGN_ID || '';")
  }

  if ($s -notmatch 'function ebayBrowseHeaders') {
    $marker = 'async function getItemDetail(itemId, token) {'
    if (-not $s.Contains($marker)) { throw 'item detail marker not found' }
    $helper = @'
function ebayBrowseHeaders(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
    Accept: 'application/json'
  };
  if (!isSandbox && EPN_CAMPAIGN_ID) {
    headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${EPN_CAMPAIGN_ID}`;
  }
  return headers;
}

'@
    $s = $s.Replace($marker, $helper + $marker)
  }

  $oldHeaders = @'
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
      Accept: 'application/json'
    },
'@
  $newHeaders = "    headers: ebayBrowseHeaders(token),`r`n"
  for ($i = 0; $i -lt 2; $i++) {
    $idx = $s.IndexOf($oldHeaders)
    if ($idx -lt 0) { break }
    $s = $s.Remove($idx, $oldHeaders.Length).Insert($idx, $newHeaders)
  }
  if (($s | Select-String -Pattern 'headers: ebayBrowseHeaders\(token\)' -AllMatches).Matches.Count -lt 2) {
    throw 'could not wire both Browse request header blocks'
  }

  if ($s -notmatch 'affiliateWebUrl:') {
    $needle = '    itemWebUrl: normalizePublicHttpsUrl(item.itemWebUrl),'
    if (-not $s.Contains($needle)) { throw 'normalized item URL marker not found' }
    $replacement = @'
    sourceItemWebUrl: normalizePublicHttpsUrl(item.itemWebUrl),
    affiliateWebUrl: normalizePublicHttpsUrl(item.itemAffiliateWebUrl),
    itemWebUrl: normalizePublicHttpsUrl(item.itemAffiliateWebUrl) || normalizePublicHttpsUrl(item.itemWebUrl),
'@
    $s = $s.Replace($needle, $replacement.TrimEnd("`r", "`n"))
  }

  $s = $s.Replace("version: '0.6.0'", "version: '0.6.1'")
  Set-Content -Path $path -Value $s -Encoding UTF8

  & node --check $path
  if ($LASTEXITCODE -ne 0) { throw 'Node syntax check failed' }

  & nssm restart HDP-UltraHype-eBay | Out-Null
  Start-Sleep -Seconds 4

  $health = Invoke-RestMethod 'http://127.0.0.1:4317/health' -TimeoutSec 20
  $search = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/search?q=games&limit=1' -TimeoutSec 45
  $categories = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/categories' -TimeoutSec 45

  $item = @($search.items)[0]
  $affiliatePresent = -not [string]::IsNullOrWhiteSpace([string]$item.affiliateWebUrl)
  $campaignEmbedded = $affiliatePresent -and ([string]$item.affiliateWebUrl).Contains('campid=' + $CampaignId)
  $sourcePresent = -not [string]::IsNullOrWhiteSpace([string]$item.sourceItemWebUrl)

  Write-Output ('HEALTH_OK=' + [bool]$health.ok)
  Write-Output ('VERSION=' + [string]$health.version)
  Write-Output ('ENV=' + [string]$health.environment)
  Write-Output ('SEARCH_COUNT=' + [string]$search.count)
  Write-Output ('AFFILIATE_URL_PRESENT=' + [bool]$affiliatePresent)
  Write-Output ('CAMPAIGN_EMBEDDED=' + [bool]$campaignEmbedded)
  Write-Output ('SOURCE_URL_PRESERVED=' + [bool]$sourcePresent)
  Write-Output ('CATEGORY_COUNT=' + [string]@($categories.categories).Count)

  if (-not $health.ok -or -not $affiliatePresent -or -not $campaignEmbedded -or -not $sourcePresent -or @($categories.categories).Count -lt 20) {
    throw 'EPN affiliate QA failed'
  }

  Write-Output ('BACKUP=' + $backup)
  Write-Output 'UH_EPN_AFFILIATE_PASS'
}
catch {
  Copy-Item $backup $path -Force
  Copy-Item $envBackup $envPath -Force
  try { & nssm restart HDP-UltraHype-eBay | Out-Null } catch {}
  Write-Output 'UH_EPN_AFFILIATE_ROLLBACK=True'
  throw
}
