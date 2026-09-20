$ErrorActionPreference = 'Stop'

$vars = @{}
Get-Content '.env' | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
  }
}

$app = [string]$vars['APP_ID']
$cert = [string]$vars['CERT_ID']
if ([string]::IsNullOrWhiteSpace($app) -or [string]::IsNullOrWhiteSpace($cert)) {
  throw 'Production credentials are not configured'
}

$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($app + ':' + $cert))
$tokenResponse = Invoke-RestMethod -Method Post -Uri 'https://api.ebay.com/identity/v1/oauth2/token' -Headers @{ Authorization = ('Basic ' + $pair); 'Content-Type' = 'application/x-www-form-urlencoded' } -Body 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope' -TimeoutSec 30
$token = [string]$tokenResponse.access_token
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Generic production token was not returned' }
Write-Output 'GENERIC_PROD_TOKEN_OK=True'

$headers = @{ Authorization = ('Bearer ' + $token); 'X-EBAY-C-MARKETPLACE-ID' = 'EBAY_US'; Accept = 'application/json' }
$url = 'https://api.ebay.com/buy/marketing/v1_beta/merchandised_product?category_id=31388&metric_name=BEST_SELLING&limit=3'
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -Headers $headers -TimeoutSec 45
  Write-Output ('BETA_HTTP=' + [string]$r.StatusCode)
  $p = $r.Content | ConvertFrom-Json
  $products = @($p.merchandisedProducts)
  Write-Output ('BETA_COUNT=' + [string]$products.Count)
  if ($products.Count -gt 0) {
    Write-Output ('BETA_SAMPLE_EPID=' + [string]$products[0].epid)
    Write-Output ('BETA_SAMPLE_TITLE=' + [string]$products[0].title)
  }
} catch {
  $response = $_.Exception.Response
  $status = if ($response) { [int]$response.StatusCode } else { 0 }
  Write-Output ('BETA_HTTP=' + [string]$status)
  Write-Output ('BETA_ERROR=' + $_.Exception.Message)
  if ($response) {
    try {
      $reader = New-Object IO.StreamReader($response.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
      if ($body.Length -gt 500) { $body = $body.Substring(0, 500) }
      Write-Output ('BETA_BODY=' + $body)
    } catch {}
  }
}
Write-Output 'UH_EBAY_MARKETING_BETA_PROBE_DONE'
