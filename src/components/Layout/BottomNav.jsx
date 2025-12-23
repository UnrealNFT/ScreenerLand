import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaHome, FaChartBar, FaUser, FaRocket, FaUsers } from 'react-icons/fa'
import { useWallet } from '../../contexts/WalletContext'
import toast from 'react-hot-toast'

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { walletAddress, isConnected } = useWallet()
  
  const navItems = [
    { path: '/', label: 'Home', icon: FaHome },
    { path: '/screener', label: 'Screener', icon: FaChartBar },
    { path: '/feed', label: 'Feed', icon: FaRocket },
    { path: null, label: 'Land', icon: FaUser, action: 'profile' },
  ]
  
  const handleNavClick = (item, e) => {
    if (item.action === 'profile') {
      e.preventDefault()
      if (isConnected && walletAddress) {
        navigate('/profile')
      } else {
        toast.error('Please connect your wallet first')
      }
    }
  }
  
  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-dark-border safe-area-bottom"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.path ? location.pathname === item.path : location.pathname === '/profile'
          
          const content = (
            <motion.div
              whileTap={{ scale: 0.9 }}
              className={`flex flex-col items-center ${
                isActive ? 'text-primary' : 'text-gray-400'
              }`}
            >
              <Icon className={`text-xl mb-1 transition-all duration-300 ${
                isActive ? 'scale-110' : 'group-hover:scale-105'
              }`} />
              <span className={`text-xs font-medium ${
                isActive ? 'font-semibold' : ''
              }`}>
                {item.label}
              </span>
              
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 w-12 h-1 bg-primary rounded-b-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.div>
          )
          
          return item.path ? (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full group"
            >
              {content}
            </Link>
          ) : (
            <button
              key={item.label}
              onClick={(e) => handleNavClick(item, e)}
              className="flex flex-col items-center justify-center flex-1 h-full group"
            >
              {content}
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
