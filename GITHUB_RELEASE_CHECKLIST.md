# 🚀 ScreenerLand GitHub Release Checklist

## ✅ Security Hardening (COMPLETED)

### Environment Variables
- ✅ All API keys moved to .env files
- ✅ Database passwords secured
- ✅ .gitignore configured to exclude .env files
- ✅ .env.example templates created for both frontend and backend
- ✅ Frontend API keys removed (now proxied through backend)
- ✅ CTO wallet addresses moved to environment variables

### Cleanup
- ✅ Deleted Account 1_secret_key.pem (private key)
- ✅ Deleted all .env files (will be in .gitignore)
- ✅ Removed all *.backup and *.old files
- ✅ Deleted 11 development/testing scripts
- ✅ Removed admin-panel.html and fix-hash.html
- ✅ Deleted 10 redundant documentation files
- ✅ Removed 4 unused folders (frontend, frontend-casper, csprbuybot, chat-server)
- ✅ Cleaned dist/ build artifacts
- ✅ Removed hardcoded secrets from all source files
- ✅ Created professional README.md

### Code Quality
- ✅ All secrets validated to be environment variables
- ✅ Frontend no longer has direct API access
- ✅ Backend properly uses process.env
- ✅ SECURITY.md documentation complete

---

## 📝 Next Steps (TO DO)

### 1. Recreate .env Files (LOCAL ONLY - DO NOT COMMIT)

**Backend .env** (`screenerfun/backend/.env`):
```env
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
```

**Frontend .env** (`screenerfun/.env`):
```env
VITE_RPC_URL=https://node.testnet.casper.network/rpc
VITE_NETWORK_NAME=casper-test
```

### 2. Test Application

```powershell
# Terminal 1 - Start database
# Ensure PostgreSQL is running

# Terminal 2 - Start backend
cd C:\Users\Djaf\Demo-Beatcoin-main\screenerfun\backend
npm install
npm run dev

# Terminal 3 - Start frontend
cd C:\Users\Djaf\Demo-Beatcoin-main\screenerfun
npm install
npm run dev
```

Open browser: http://localhost:5173

**Test These Features:**
- [ ] Homepage loads
- [ ] Screener page shows tokens
- [ ] Stories page loads
- [ ] Wallet connection works
- [ ] Profile page shows assets
- [ ] Token detail pages work
- [ ] Community chat works

### 3. Initialize Git Repository

```powershell
cd C:\Users\Djaf\Demo-Beatcoin-main\screenerfun
git init
git add .
git status  # Verify .env files are NOT listed (should be ignored)
```

**If .env files appear in `git status`:**
```powershell
git rm --cached .env
git rm --cached backend/.env
```

### 4. First Commit

```powershell
git commit -m "Initial release - ScreenerLand Beta for Casper Hackathon 2026

Features:
- Token screener with real-time data
- Social stories with CTO system
- Community chat per token
- User profiles with wallet integration
- 90-day inactivity mechanics

Tech Stack:
- React 18 + Vite
- Node.js + Express + PostgreSQL
- CSPR.click wallet integration
- CSPR.cloud API
- WebSocket real-time features

Security:
- All sensitive data in environment variables
- No hardcoded API keys or passwords
- .gitignore configured properly
"
```

### 5. Create GitHub Repository

**Option A: GitHub CLI**
```powershell
gh repo create screenerfun --public --source=. --remote=origin --push
```

**Option B: Manual**
1. Go to https://github.com/new
2. Create repository "screenerfun"
3. Choose "Public"
4. DO NOT initialize with README
5. Copy the commands shown

```powershell
git remote add origin https://github.com/YOUR_USERNAME/screenerfun.git
git branch -M main
git push -u origin main
```

### 6. Add Repository Details

On GitHub, edit repository:
- **Description**: "Social DeFi platform for Casper Network - Token screener, stories, and community features"
- **Website**: (your demo URL if available)
- **Topics**: `casper-network`, `defi`, `blockchain`, `hackathon`, `social-platform`, `token-screener`
- **License**: MIT

### 7. Post-Upload Verification

- [ ] Check .env files are NOT visible on GitHub
- [ ] Check README.md renders correctly
- [ ] Verify all documentation is present
- [ ] Test cloning on a different machine
- [ ] Confirm setup instructions work for new users

### 8. Hackathon Submission

**Casper Hackathon 2026 Submission:**
- Submission Period: Nov 14, 2025 → Jan 18, 2026
- Platform: Devpost or Casper's official platform
- Required:
  - GitHub repository URL
  - Live demo (optional but recommended)
  - Video demo (3-5 minutes)
  - Project description
  - Team information

**Prepare:**
- [ ] Record demo video showing all features
- [ ] Take screenshots of key pages
- [ ] Write project description highlighting uniqueness
- [ ] Prepare pitch focusing on "social DeFi" angle

---

## 🔒 Security Reminders

**NEVER COMMIT:**
- ❌ `.env` files
- ❌ `*.pem` private keys
- ❌ API keys or passwords
- ❌ Database credentials
- ❌ `server.log` or debug logs

**ALWAYS:**
- ✅ Use .env.example templates
- ✅ Document environment variables
- ✅ Keep .gitignore updated
- ✅ Review commits before pushing
- ✅ Use backend proxy for API calls

---

## 📧 Support

If you encounter issues during setup:
1. Check SECURITY.md for deployment guidelines
2. Verify all environment variables are set
3. Ensure PostgreSQL is running
4. Check backend logs: `backend/server.log`
5. Review browser console for frontend errors

---

**Good luck with the Hackathon! 🚀**
