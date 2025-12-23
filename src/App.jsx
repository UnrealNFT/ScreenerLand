import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AnimatePresence } from 'framer-motion'
import { WalletProvider } from './contexts/WalletContext'

// Layout
import Layout from './components/Layout/Layout'

// Pages
import Home from './pages/Home'
import Screener from './pages/Screener'
import TokenPage from './pages/TokenPage'
import ChatPage from './pages/ChatPage'
import Profile from './pages/Profile'
import ProfilePage from './pages/ProfilePage'
import WalletProfile from './pages/WalletProfile'
import FeedPage from './pages/FeedPage'
import CommunityPage from './pages/CommunityPage'
import AdminCleanup from './pages/AdminCleanup'

function App() {
  return (
    <WalletProvider>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="screener" element={<Screener />} />
            <Route path="community" element={<CommunityPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="admin/cleanup" element={<AdminCleanup />} />
            <Route path="admin-cleanup" element={<AdminCleanup />} />
            <Route path="token/:contractHash" element={<TokenPage />} />
            <Route path="chat/:contractHash" element={<ChatPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="wallet/:address" element={<WalletProfile />} />
            <Route path="profile/:address" element={<Profile />} />
          </Route>
        </Routes>
      </AnimatePresence>
      
      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1A1A1A',
            color: '#fff',
            border: '1px solid #2A2A2A',
          },
          success: {
            iconTheme: {
              primary: '#00D084',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#FF6B6B',
              secondary: '#fff',
            },
          },
        }}
      />
    </WalletProvider>
  )
}

export default App
