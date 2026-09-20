$ErrorActionPreference = 'Stop'

$path = 'C:\HDP\UltraHype\ebay\index.js'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$backup = "$path.bak-$stamp"
Copy-Item $path $backup -Force

$s = Get-Content $path -Raw
$nl = [Environment]::NewLine

if ($s -notmatch "node:crypto") {
  $s = $s.Replace(
    "import path from 'node:path';",
    "import path from 'node:path';${nl}import { createHash } from 'node:crypto';"
  )
}

if ($s -notmatch 'EBAY_DELETION_VERIFICATION_TOKEN') {
  $needle = "const ACTIVITY_FILE = path.join(ACTIVITY_DIR, 'events.ndjson');"
  $insert = $needle + $nl +
    "const EBAY_DELETION_VERIFICATION_TOKEN = process.env.EBAY_DELETION_VERIFICATION_TOKEN || '';" + $nl +
    "const EBAY_DELETION_ENDPOINT = process.env.EBAY_DELETION_ENDPOINT || 'https://api.ultrahype.store/api/commerce/ebay/account-deletion';"
  $s = $s.Replace($needle, $insert)
}

if ($s -notmatch "app.get\('/api/commerce/ebay/account-deletion'") {
  $route = @'
app.get('/api/commerce/ebay/account-deletion', (req, res) => {
  const challengeCode = safeText(req.query.challenge_code, 256);
  if (!challengeCode) return res.status(400).json({ error: 'missing_challenge_code' });
  if (!EBAY_DELETION_VERIFICATION_TOKEN) {
    return res.status(503).json({ error: 'verification_token_not_configured' });
  }
  const challengeResponse = createHash('sha256')
    .update(challengeCode, 'utf8')
    .update(EBAY_DELETION_VERIFICATION_TOKEN, 'utf8')
    .update(EBAY_DELETION_ENDPOINT, 'utf8')
    .digest('hex');
  return res.status(200).type('application/json').json({ challengeResponse });
});

app.post('/api/commerce/ebay/account-deletion', (req, res) => {
  const topic = String(req.body?.metadata?.topic || '');
  if (topic && topic !== 'MARKETPLACE_ACCOUNT_DELETION') {
    return res.status(400).json({ error: 'unexpected_topic' });
  }
  return res.sendStatus(204);
});

'@
  $s = $s.Replace("app.get('/health'", $route + "app.get('/health'")
}

Set-Content -Path $path -Value $s -Encoding UTF8

& node --check $path
if ($LASTEXITCODE -ne 0) {
  Copy-Item $backup $path -Force
  throw 'Node syntax check failed; restored backup'
}

& nssm restart HDP-UltraHype-eBay | Out-Null
Start-Sleep -Seconds 4

$health = Invoke-RestMethod 'http://127.0.0.1:4317/health' -TimeoutSec 20
Write-Output ('HEALTH_OK=' + [bool]$health.ok)

$vars = @{}
Get-Content '.env' | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
$token = [string]$vars['EBAY_DELETION_VERIFICATION_TOKEN']
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'verification token missing after restart'
}

$endpoint = 'https://api.ultrahype.store/api/commerce/ebay/account-deletion'
$challenge = 'uh-test-' + [guid]::NewGuid().ToString('N')
$public = Invoke-RestMethod ($endpoint + '?challenge_code=' + $challenge) -TimeoutSec 30

$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $bytes = [Text.Encoding]::UTF8.GetBytes($challenge + $token + $endpoint)
  $expected = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
}
finally {
  $sha.Dispose()
}

Write-Output ('CHALLENGE_MATCH=' + [bool]($public.challengeResponse -eq $expected))

$body = @{
  metadata = @{
    topic = 'MARKETPLACE_ACCOUNT_DELETION'
    schemaVersion = '1.0'
    deprecated = $false
  }
  notification = @{
    notificationId = [guid]::NewGuid().ToString()
    eventDate = (Get-Date).ToUniversalTime().ToString('o')
    publishDate = (Get-Date).ToUniversalTime().ToString('o')
    publishAttemptCount = 1
    data = @{
      username = 'uh-test-user'
      userId = 'uh-test'
      eiasToken = 'uh-test'
    }
  }
} | ConvertTo-Json -Depth 6

$post = Invoke-WebRequest $endpoint -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 30
Write-Output ('POST_STATUS=' + $post.StatusCode)
Write-Output ('BACKUP=' + $backup)

if (-not $health.ok -or $public.challengeResponse -ne $expected -or $post.StatusCode -ne 204) {
  throw 'endpoint QA failed'
}

Write-Output 'UH_EBAY_DELETION_ENDPOINT_PASS'
