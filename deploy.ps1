# One-click deploy: regenerate static export from Local WP, then push to Firebase.
#
# Prereqs (one-time):
#   - Local by Flywheel running site `skdental` at http://skdental.local
#   - Simply Static plugin installed and configured to write into:
#       C:\Users\SKDENTAL\Desktop\skdental-firebase\public\
#   - Firebase CLI logged in: `firebase login`
#   - .firebaserc updated with your real project ID
#
# Usage: from this folder, run:  .\deploy.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "==> [1/3] Triggering Simply Static export from Local WP..." -ForegroundColor Cyan
# Simply Static exposes a REST API once you log in once and grab an Application Password.
# Replace USER and APP_PASSWORD below with values from wp-admin -> Users -> Profile -> Application Passwords.
$wpUser = "skdentaladmin"
$wpAppPass = "REPLACE-WITH-WP-APPLICATION-PASSWORD"
$auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${wpUser}:${wpAppPass}"))
try {
    Invoke-RestMethod -Uri "http://skdental.local/wp-json/simplystatic/v1/start-export" `
        -Method POST `
        -Headers @{ Authorization = "Basic $auth" } `
        -TimeoutSec 600 | Out-Null
    Write-Host "    Export started. Waiting for it to finish..." -ForegroundColor Gray
    do {
        Start-Sleep -Seconds 5
        $status = Invoke-RestMethod -Uri "http://skdental.local/wp-json/simplystatic/v1/is-running" `
            -Headers @{ Authorization = "Basic $auth" }
        Write-Host "    ...still running" -ForegroundColor Gray
    } while ($status.running -eq $true)
    Write-Host "    Export complete." -ForegroundColor Green
} catch {
    Write-Host "    REST trigger failed. Falling back: open http://skdental.local/wp-admin/admin.php?page=simply-static_settings and click Generate manually, then re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "==> [2/3] Sanity-checking the export..." -ForegroundColor Cyan
$indexPath = Join-Path $here "public\index.html"
if (-not (Test-Path $indexPath)) {
    Write-Host "    FAIL: $indexPath not found. Did Simply Static write to the wrong directory?" -ForegroundColor Red
    exit 1
}
$wpAdminPath = Join-Path $here "public\wp-admin"
if (Test-Path $wpAdminPath) {
    Write-Host "    WARN: wp-admin/ found in export and will be deployed publicly. Removing." -ForegroundColor Yellow
    Remove-Item $wpAdminPath -Recurse -Force
}
$wpLogin = Join-Path $here "public\wp-login.php"
if (Test-Path $wpLogin) { Remove-Item $wpLogin -Force }
Write-Host "    Sanity check passed." -ForegroundColor Green

Write-Host "==> [3/3] Deploying to Firebase Hosting..." -ForegroundColor Cyan
firebase deploy --only hosting
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Firebase deploy failed." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "==> Done. Site is live." -ForegroundColor Green
