# Recreate .env files for LOCAL DEVELOPMENT ONLY
# DO NOT COMMIT THESE FILES TO GIT

Write-Host "Creating .env files for local development..." -ForegroundColor Cyan

# Backend .env
$backendEnv = @"
DATABASE_PASSWORD=3523
CSPR_CLOUD_KEY_WALLET=019aeb36-ae37-73aa-9619-4850d9bef5d7
CSPR_CLOUD_KEY_GENERAL=019aeb3c-6bba-7cde-bd54-7458ff125bb6
CSPR_CLOUD_KEY_OWNER=019aec16-1dde-7054-84fe-9a007d549527
CSPR_CLOUD_KEY_FALLBACK=019ab0fc-1a64-7cae-afba-cd3c49010b17
CSPR_CLOUD_KEY_LEGACY=c3247bc3dce4493896a8353d37cbf902
ADMIN_PASSWORD=yy1422
CTO_RECEIVER_WALLET=0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8
CTO_RECEIVER_ACCOUNT_HASH=b0ffce605fec444f624757ec3548af878ce20bce704e92602b55ba7aaae27792
PORT=3001
FRONTEND_URL=http://localhost:5173
"@

# Frontend .env
$frontendEnv = @"
VITE_RPC_URL=https://node.testnet.casper.network/rpc
VITE_NETWORK_NAME=casper-test
"@

# Create backend .env
$backendEnv | Out-File -FilePath "backend\.env" -Encoding UTF8 -NoNewline
Write-Host "Created: backend\.env" -ForegroundColor Green

# Create frontend .env
$frontendEnv | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
Write-Host "Created: .env" -ForegroundColor Green

Write-Host "`nDone! You can now run the application." -ForegroundColor Green
Write-Host "REMINDER: These files are in .gitignore and will NOT be committed." -ForegroundColor Yellow
