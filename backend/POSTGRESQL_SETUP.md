# PostgreSQL Installation and Setup Guide for Windows

## Installation Instructions

### 1. Install PostgreSQL

Download and install PostgreSQL from:
https://www.postgresql.org/download/windows/

**Recommended version**: PostgreSQL 15 or 16

During installation:
- Set a password for the postgres user (remember this!)
- Use default port: 5432
- Keep all components checked

### 2. Create Database

After installation, open **pgAdmin 4** (installed with PostgreSQL) or use **psql** command line:

#### Option A: Using pgAdmin 4
1. Open pgAdmin 4
2. Connect to PostgreSQL (localhost)
3. Right-click on "Databases" → Create → Database
4. Name: `screenerfun`
5. Click Save

#### Option B: Using Command Line (psql)
```powershell
# Open PowerShell as Administrator
psql -U postgres

# In psql prompt:
CREATE DATABASE screenerfun;
\q
```

### 3. Update .env File

The `.env` file is already created with the correct settings:
```
DATABASE_URL=postgresql://localhost:5432/screenerfun
```

If you set a password for postgres user, update to:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/screenerfun
```

### 4. Initialize Database Schema

The backend will automatically run `schema.sql` on first start.
This creates all tables (users, stories, comments, likes, views, chat_messages).

## Quick Install Commands

```powershell
# 1. Download PostgreSQL installer
# Visit: https://www.postgresql.org/download/windows/

# 2. After install, create database
psql -U postgres -c "CREATE DATABASE screenerfun;"

# 3. Start backend (will auto-initialize schema)
cd C:\Users\Djaf\Demo-Beatcoin-main\screenerfun\backend
node server.js
```

## Verify Installation

```powershell
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# List databases
psql -U postgres -c "\l"

# Connect to screenerfun database
psql -U postgres -d screenerfun

# List tables (after backend starts)
\dt
```

## Troubleshooting

**Error: "password authentication failed"**
- Update DATABASE_URL in .env with your postgres password

**Error: "database does not exist"**
- Run: `psql -U postgres -c "CREATE DATABASE screenerfun;"`

**Error: "could not connect to server"**
- PostgreSQL service not running
- Open Services (services.msc) and start "postgresql-x64-15"

## Production Deployment (Hetzner)

When deploying to Hetzner:
1. Create PostgreSQL instance on Hetzner Cloud
2. Update .env with Hetzner DATABASE_URL:
   ```
   DATABASE_URL=postgresql://user:pass@hetzner-server.com:5432/screenerfun
   ```
3. Deploy backend - schema will auto-initialize
4. Data persists across restarts ✅
