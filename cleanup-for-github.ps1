# 🧹 GitHub Cleanup Script
# Run this before pushing to GitHub

Write-Host "🚀 Preparing ScreenerLand for GitHub Release..." -ForegroundColor Cyan
Write-Host ""

# 1. Remove sensitive files
Write-Host "🔒 Removing sensitive files..." -ForegroundColor Yellow
$sensitiveFiles = @(
    "Account 1_secret_key.pem",
    "backend\.env",
    "backend\server.log",
    ".env"
)

foreach ($file in $sensitiveFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  ✓ Deleted: $file" -ForegroundColor Green
    }
}

# 2. Remove backup files
Write-Host "`n🗑️ Removing backup files..." -ForegroundColor Yellow
Get-ChildItem -Recurse -Include *.backup,*.old | ForEach-Object {
    Write-Host "  ✓ Deleted: $($_.FullName)" -ForegroundColor Green
    Remove-Item $_.FullName -Force
}

# 3. Remove development/testing files
Write-Host "`n🧪 Removing dev/test files..." -ForegroundColor Yellow
$devFiles = @(
    "backend\check-cto.js",
    "backend\check_db.js",
    "backend\clean-cto-db.js",
    "backend\clean-cto.js",
    "backend\cleanup_db.js",
    "backend\create-demo-stories.js",
    "backend\fix-hash-in-db.js",
    "backend\normalize_token_hashes.js",
    "backend\migrate-cto-table.js",
    "admin-panel.html",
    "fix-hash.html",
    "SOLUTION_CTO_MANUELLE.jsx",
    "api.txt",
    "orda.txt",
    "cspr.fun+fm"
)

foreach ($file in $devFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  ✓ Deleted: $file" -ForegroundColor Green
    }
}

# 4. Remove redundant documentation
Write-Host "`n📄 Removing redundant docs..." -ForegroundColor Yellow
$redundantDocs = @(
    "DEPLOY_GUIDE.md",
    "DEPLOYMENT_GUIDE.md",
    "REAL_DEPLOYMENT_GUIDE.md",
    "OPTION_A_COMPLETED.md",
    "SYSTEME_COMPLET_RECAP.md",
    "FRIENDLY_MARKET_API_DISCOVERED.md",
    "HOW_TO_GET_WASM.md",
    "WASM_SETUP.md",
    "TODO_SMART_CONTRACT.md",
    "IMPLEMENTATION_STATUS.md"
)

foreach ($doc in $redundantDocs) {
    if (Test-Path $doc) {
        Remove-Item $doc -Force
        Write-Host "  ✓ Deleted: $doc" -ForegroundColor Green
    }
}

# 5. Remove unused folders
Write-Host "`n📁 Removing unused folders..." -ForegroundColor Yellow
$unusedFolders = @(
    "frontend",
    "frontend-casper",
    "csprbuybot",
    "chat-server"
)

foreach ($folder in $unusedFolders) {
    if (Test-Path $folder) {
        Remove-Item $folder -Recurse -Force
        Write-Host "  ✓ Deleted folder: $folder" -ForegroundColor Green
    }
}

# 6. Clean up dist and build artifacts
Write-Host "`n🔨 Cleaning build artifacts..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force
    Write-Host "  ✓ Deleted: dist/" -ForegroundColor Green
}

# 7. Verify .gitignore exists
Write-Host "`n📋 Verifying .gitignore..." -ForegroundColor Yellow
if (Test-Path ".gitignore") {
    Write-Host "  ✓ .gitignore exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ WARNING: .gitignore not found!" -ForegroundColor Red
}

# 8. Check for remaining sensitive data
Write-Host "`n🔍 Scanning for remaining secrets..." -ForegroundColor Yellow
$secretPatterns = @(
    "secret_key",
    "private_key",
    "password.*=.*['\`"]",
    "api_key.*=.*['\`"]"
)

$foundSecrets = $false
Get-ChildItem -Recurse -Include *.js,*.jsx,*.ts,*.tsx -Exclude node_modules | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    foreach ($pattern in $secretPatterns) {
        if ($content -match $pattern) {
            Write-Host "  ⚠️ Potential secret in: $($_.FullName)" -ForegroundColor Red
            $foundSecrets = $true
        }
    }
}

if (-not $foundSecrets) {
    Write-Host "  ✓ No obvious secrets found in code" -ForegroundColor Green
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review changes with: git status" -ForegroundColor White
Write-Host "  2. Test the application still works" -ForegroundColor White
Write-Host "  3. Commit: git add . ; git commit -m 'Prepare for public release'" -ForegroundColor White
Write-Host "  4. Push: git push origin main" -ForegroundColor White
Write-Host ""
Write-Host "🔒 Remember to keep backend/.env private!" -ForegroundColor Red
Write-Host ""
