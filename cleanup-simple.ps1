# ScreenerLand GitHub Cleanup Script
# Removes sensitive files, test files, and unnecessary docs before public release

$ErrorActionPreference = "Continue"

Write-Host "=================================="  -ForegroundColor Cyan
Write-Host "ScreenerLand GitHub Cleanup Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# 1. Remove sensitive files
Write-Host "`nRemoving sensitive files..." -ForegroundColor Yellow

$sensitiveFiles = @(
    "Account 1_secret_key.pem",
    ".env",
    "backend\.env",
    "backend\server.log"
)

foreach ($file in $sensitiveFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  Deleted: $file" -ForegroundColor Green
    } else {
        Write-Host "  Not found: $file" -ForegroundColor Gray
    }
}

# 2. Remove backup files
Write-Host "`nRemoving backup files..." -ForegroundColor Yellow
$backupFiles = Get-ChildItem -Recurse -Include *.backup,*.old -ErrorAction SilentlyContinue
foreach ($file in $backupFiles) {
    Remove-Item $file.FullName -Force
    Write-Host "  Deleted: $($file.Name)" -ForegroundColor Green
}

# 3. Remove development/testing files
Write-Host "`nRemoving dev/test files..." -ForegroundColor Yellow

$devFiles = @(
    "backend\check-cto.js",
    "backend\check_db.js",
    "backend\clean-cto-db.js",
    "backend\cleanup_db.js",
    "backend\create-demo-stories.js",
    "backend\fix-hash-in-db.js",
    "backend\normalize_token_hashes.js",
    "backend\migrate-cto-table.js",
    "backend\testing_db.js",
    "src\components\SOLUTION_CTO_MANUELLE.jsx",
    "admin-panel.html",
    "fix-hash.html",
    "api.txt",
    "orda.txt",
    "cspr.fun+fm"
)

foreach ($file in $devFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  Deleted: $file" -ForegroundColor Green
    }
}

# 4. Remove redundant documentation
Write-Host "`nRemoving redundant docs..." -ForegroundColor Yellow

$redundantDocs = @(
    "DEPLOY_GUIDE.md",
    "DEPLOYMENT_GUIDE.md",
    "FRIENDLY_MARKET_API_DISCOVERED.md",
    "HOW_TO_GET_WASM.md",
    "IMPLEMENTATION_STATUS.md",
    "OPTION_A_COMPLETED.md",
    "REAL_DEPLOYMENT_GUIDE.md",
    "SYSTEME_COMPLET_RECAP.md",
    "TODO_SMART_CONTRACT.md",
    "WASM_SETUP.md"
)

foreach ($doc in $redundantDocs) {
    if (Test-Path $doc) {
        Remove-Item $doc -Force
        Write-Host "  Deleted: $doc" -ForegroundColor Green
    }
}

# 5. Remove unused folders
Write-Host "`nRemoving unused folders..." -ForegroundColor Yellow

$unusedFolders = @(
    "frontend",
    "frontend-casper",
    "csprbuybot",
    "chat-server"
)

foreach ($folder in $unusedFolders) {
    if (Test-Path $folder) {
        Remove-Item $folder -Recurse -Force
        Write-Host "  Deleted: $folder" -ForegroundColor Green
    }
}

# 6. Clean build artifacts
Write-Host "`nCleaning build artifacts..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force
    Write-Host "  Deleted: dist" -ForegroundColor Green
}

# 7. Security scan for remaining secrets
Write-Host "`nScanning for remaining secrets..." -ForegroundColor Yellow

$secretPatterns = @(
    "secret_key",
    "019aeb",
    "c3247bc3dce4493896a8353d37cbf902"
)

$foundSecrets = $false

Get-ChildItem -Recurse -Include *.js,*.jsx,*.ts,*.tsx,*.json -ErrorAction SilentlyContinue | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        foreach ($pattern in $secretPatterns) {
            if ($content -like "*$pattern*") {
                Write-Host "  WARNING: Found '$pattern' in $($_.FullName)" -ForegroundColor Red
                $foundSecrets = $true
            }
        }
    }
}

if (-not $foundSecrets) {
    Write-Host "  No hardcoded secrets found!" -ForegroundColor Green
}

# 8. Summary
Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Cleanup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  1. Test the application: npm run dev" -ForegroundColor White
Write-Host "  2. Check git status: git status" -ForegroundColor White
Write-Host "  3. Commit: git add . ; git commit -m 'Prepare for public release'" -ForegroundColor White
Write-Host "  4. Push: git push origin main" -ForegroundColor White

Write-Host "`nReminder:" -ForegroundColor Yellow
Write-Host "  - backend/.env.example should exist (template)" -ForegroundColor White
Write-Host "  - .gitignore should exclude all .env files" -ForegroundColor White
Write-Host "  - README.md should have setup instructions" -ForegroundColor White
Write-Host ""
