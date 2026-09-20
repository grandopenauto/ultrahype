$ErrorActionPreference = 'Stop'

$vars = @{}
Get-Content '.env' | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
  }
}

$token = [string]$vars['EBAY_DELETION_VERIFICATION_TOKEN']
if ([string]::IsNullOrWhiteSpace($token)) { throw 'verification token missing' }

$endpoint = 'https://api.ultrahype.store/api/commerce/ebay/account-deletion'
$challenge = 'ultrahype-ebay-verification-test'
$tmp = Join-Path $env:TEMP 'uh-ebay-challenge.json'

& curl.exe --silent --show-error --fail --resolve 'api.ultrahype.store:443:127.0.0.1' ($endpoint + '?challenge_code=' + $challenge) -o $tmp
if ($LASTEXITCODE -ne 0) { throw 'HTTPS challenge request failed' }
$public = Get-Content $tmp -Raw | ConvertFrom-Json

$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $bytes = [Text.Encoding]::UTF8.GetBytes($challenge + $token + $endpoint)
  $expected = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
}
finally {
  $sha.Dispose()
}
Write-Output ('HTTPS_CHALLENGE_MATCH=' + [bool]($public.challengeResponse -eq $expected))

$payload = @{
  metadata = @{
    topic = 'MARKETPLACE_ACCOUNT_DELETION'
    schemaVersion = '1.0'
    deprecated = $false
  }
  notification = @{
    notificationId = 'uh-test'
    eventDate = (Get-Date).ToUniversalTime().ToString('o')
    publishDate = (Get-Date).ToUniversalTime().ToString('o')
    publishAttemptCount = 1
    data = @{
      username = 'uh-test-user'
      userId = 'uh-test'
      eiasToken = 'uh-test'
    }
  }
} | ConvertTo-Json -Depth 6 -Compress

$jsonFile = Join-Path $env:TEMP 'uh-ebay-deletion-post.json'
[IO.File]::WriteAllText($jsonFile, $payload, (New-Object Text.UTF8Encoding($false)))

$code = & curl.exe --silent --show-error --output NUL --write-out '%{http_code}' --resolve 'api.ultrahype.store:443:127.0.0.1' -H 'Content-Type: application/json' --data-binary ('@' + $jsonFile) $endpoint
Write-Output ('HTTPS_POST_STATUS=' + $code)

if ($public.challengeResponse -ne $expected -or $code -ne '204') { throw 'endpoint HTTPS QA failed' }
Write-Output 'UH_EBAY_DELETION_ENDPOINT_HTTPS_QA_PASS'
