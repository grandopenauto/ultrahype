$ErrorActionPreference = 'Stop'
$result = Invoke-RestMethod 'http://127.0.0.1:4317/api/commerce/ebay/search?q=sneakers&limit=8' -TimeoutSec 60
$curl = (Get-Command curl.exe -ErrorAction Stop).Source
$ok = $true
foreach ($item in @($result.items)) {
  $url = [string]$item.image
  if (-not $url) {
    Write-Output ('IMAGE_MISSING=' + $item.title)
    $ok = $false
    continue
  }
  $stat = & $curl --location --silent --show-error --max-time 20 --output NUL --write-out '%{http_code} %{content_type}' $url
  Write-Output ('IMAGE_CHECK=' + $stat + ' | ' + $item.title + ' | ' + $url)
  if ($stat -notmatch '^2\d\d image/') { $ok = $false }
}
if (-not $ok) { throw 'one or more image URLs failed verification' }
Write-Output 'UH_EBAY_IMAGE_VERIFY_PASS'
