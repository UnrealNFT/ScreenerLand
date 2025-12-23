/**
 * UserAvatar Component
 * Displays user avatar with fallback to user.png on unique color background
 * Each user gets a unique color based on their wallet address
 */

// Generate unique matte gradient color from wallet address
const getUserColor = (walletAddress) => {
  if (!walletAddress || walletAddress === 'null') {
    return { from: '#1a4d6d', to: '#2d5a7b' }
  }
  
  // Extract 3 segments from wallet for RGB values (matte = values between 30-120)
  const r1 = (parseInt(walletAddress.substring(0, 2), 16) % 90) + 30
  const g1 = (parseInt(walletAddress.substring(2, 4), 16) % 90) + 30
  const b1 = (parseInt(walletAddress.substring(4, 6), 16) % 90) + 30
  
  const r2 = (parseInt(walletAddress.substring(6, 8), 16) % 90) + 30
  const g2 = (parseInt(walletAddress.substring(8, 10), 16) % 90) + 30
  const b2 = (parseInt(walletAddress.substring(10, 12), 16) % 90) + 30
  
  const toHex = (n) => n.toString(16).padStart(2, '0')
  
  return {
    from: `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`,
    to: `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`
  }
}

export default function UserAvatar({ 
  userAvatar,
  userName, 
  userWallet, 
  size = 'md',
  className = '' 
}) {
  // Size classes
  const sizeClasses = {
    xs: 'w-5 h-5',
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
    '2xl': 'w-24 h-24'
  }
  
  // Get unique colors from wallet
  const colors = getUserColor(userWallet)
  
  return (
    <div className={`relative ${sizeClasses[size]} ${className} rounded-full overflow-hidden`}>
      {/* Custom avatar if uploaded */}
      {userAvatar ? (
        <img 
          src={userAvatar} 
          alt={userName || 'User'}
          className="w-full h-full object-cover"
          onError={(e) => {
            // If custom avatar fails, show default with gradient
            e.target.style.display = 'none'
            e.target.nextSibling.style.display = 'flex'
          }}
        />
      ) : null}
      
      {/* Default: user.png on unique gradient background */}
      <div 
        className="w-full h-full flex items-center justify-center relative"
        style={{ 
          display: userAvatar ? 'none' : 'flex',
          background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`
        }}
      >
        <img 
          src="/images/user.png" 
          alt="User"
          className="w-full h-full object-contain p-1"
        />
      </div>
    </div>
  )
}
