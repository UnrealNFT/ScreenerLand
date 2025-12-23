# 🚀 ScreenerLand - Social DeFi for Casper Network

**The first all-in-one token platform combining analytics, trading, and social features on Casper blockchain.**

[![Casper Network](https://img.shields.io/badge/Casper-Network-red)](https://casper.network)
[![Hackathon 2026](https://img.shields.io/badge/Hackathon-2026-blue)](https://casper.network/hackathon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 What is ScreenerLand?

ScreenerLand combines the best features of DexScreener, Pump.fun, and social media into a single platform for Casper Network:

- 📊 **Token Screener** - Real-time analytics for all CEP-18 tokens
- 🎬 **Social Stories** - 120-second videos by token holders  
- 💬 **Community Chat** - Real-time chat per token
- 👤 **User Profiles** - Track your portfolio & activity
- 🏆 **CTO System** - Unique "Chief Token Officer" access model

## ✨ Key Features

### Token Screener
- Live price, volume, market cap data
- Holder distribution & transaction history
- Advanced filtering & sorting
- Search across all tokens

### Social Stories (Unique!)
- **CTO Access**: Pay 10 CSPR for 90-day upload rights
- 120-second video stories per token
- TikTok/Instagram-style feed
- Engagement metrics (views, likes)

### Community Features
- Real-time chat per token
- User profiles with wallet integration
- Community rankings
- Story rewards system

## 🛠️ Tech Stack

**Frontend**
- React 18 + Vite
- Tailwind CSS + Framer Motion
- CSPR.click (wallet integration)
- Recharts (data visualization)

**Backend**
- Node.js + Express
- PostgreSQL (data persistence)
- WebSocket (real-time features)
- Multer (media uploads)

**Blockchain**
- Casper Network (mainnet + testnet)
- CEP-18 token standard
- Casper JS SDK v5.0.7
- CSPR.cloud API

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- CSPR.click wallet extension

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/screenerfun.git
cd screenerfun
```

2. **Setup Backend**
```bash
cd backend
npm install

# Create database
createdb screenerfun
psql screenerfun < schema.sql

# Configure environment
cp .env.example .env
# Edit .env with your values
```

3. **Setup Frontend**
```bash
cd ..
npm install

# Configure environment
cp .env.example .env
```

4. **Start Development Servers**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
npm run dev
```

5. **Open browser**
```
http://localhost:5173
```

## 📁 Project Structure

```
screenerfun/
├── src/                    # React frontend
│   ├── components/         # Reusable components
│   ├── contexts/          # React contexts (Wallet)
│   ├── pages/             # Main pages
│   ├── services/          # API services
│   └── hooks/             # Custom hooks
├── backend/               # Node.js backend
│   ├── server.js          # Express API
│   ├── stories-db.js      # Stories & CTO logic
│   ├── users-db.js        # User profiles
│   ├── schema.sql         # Database schema
│   └── uploads/           # User media
├── casper-contracts/      # Smart contracts (Rust)
└── public/                # Static assets
```

## 🔑 Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/screenerfun
PORT=3001
FRONTEND_URL=http://localhost:5173
ADMIN_PASSWORD=your_password
CSPR_CLOUD_KEY_GENERAL=your_api_key
```

### Frontend (.env)
```env
VITE_RPC_URL=https://rpc.mainnet.casperlabs.io/rpc
VITE_NETWORK_NAME=casper
```

## 📖 Documentation

- [Setup Guide](./backend/POSTGRESQL_SETUP.md) - Database configuration
- [Security](./SECURITY.md) - Security best practices
- [API Reference](./backend/README.md) - Backend API endpoints

## 🎮 Usage

### For Users
1. Install CSPR.click wallet extension
2. Connect your wallet
3. Browse tokens on the Screener page
4. View stories on the Home feed
5. Join token communities

### For Token Holders
1. Pay 10 CSPR to become CTO (Chief Token Officer)
2. Upload 120s videos to promote your token
3. Engage with your community
4. Stay active to keep CTO status (90 days)

## 🏗️ Deployment

See [SECURITY.md](./SECURITY.md) for production deployment guidelines.

**Key Points:**
- Use environment variables for all secrets
- Enable PostgreSQL SSL in production
- Set up HTTPS with valid certificate
- Configure CORS properly
- Monitor API rate limits

## 🤝 Contributing

This project is a Casper Hackathon 2026 submission. Contributions welcome after hackathon period!

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🏆 Hackathon Info

- **Event**: Casper Hackathon 2026
- **Track**: Main Track
- **Timeline**: Nov 14, 2025 → Jan 18, 2026
- **Prize Pool**: $25,000

## 🔗 Links

- [Casper Network](https://casper.network)
- [CSPR.cloud API](https://developers.cspr.cloud/)
- [CEP-18 Standard](https://github.com/casper-network/ceps/blob/master/ceps/cep-18.md)

## 📧 Contact

- Twitter: [@screenerfun](https://twitter.com/screenerfun)
- Telegram: [t.me/screenerfun](https://t.me/screenerfun)

---

**Built with ❤️ for Casper Network**
