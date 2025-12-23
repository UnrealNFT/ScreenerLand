/**
 * TokenAvatar Component
 * Displays token logo with fallback to generated gradient background
 * Same logic as used in Screener page
 */

// Generate unique matte gradient color from token hash
const getTokenColor = (contractHash) => {
  if (!contractHash) return { from: '#1a4d6d', to: '#2d5a7b' }
  
  // Extract 3 segments from hash for RGB values (matte = values between 30-120)
  const r1 = (parseInt(contractHash.substring(0, 2), 16) % 90) + 30
  const g1 = (parseInt(contractHash.substring(2, 4), 16) % 90) + 30
  const b1 = (parseInt(contractHash.substring(4, 6), 16) % 90) + 30
  
  const r2 = (parseInt(contractHash.substring(6, 8), 16) % 90) + 30
  const g2 = (parseInt(contractHash.substring(8, 10), 16) % 90) + 30
  const b2 = (parseInt(contractHash.substring(10, 12), 16) % 90) + 30
  
  const toHex = (n) => n.toString(16).padStart(2, '0')
  
  return {
    from: `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`,
    to: `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`
  }
}

export default function TokenAvatar({ 
  tokenHash, 
  tokenName, 
  tokenSymbol, 
  tokenLogo, 
  size = 'md',
  className = '' 
}) {
  // Size classes
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-xl',
    lg: 'w-16 h-16 text-2xl',
    xl: 'w-20 h-20 text-3xl'
  }
  
  // Get initials (prefer symbol, fallback to name)
  const initials = tokenSymbol?.substring(0, 2).toUpperCase() || 
                   tokenName?.substring(0, 2).toUpperCase() || 
                   '??'
  
  // Get unique colors from hash
  const colors = getTokenColor(tokenHash)
  
  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Real logo if available */}
      {tokenLogo && (
        <img 
          src={tokenLogo} 
          alt={tokenName || 'Token'}
          className="w-full h-full rounded-full object-cover ring-2 ring-primary/20"
          onError={(e) => {
            // Hide image and show fallback
            e.target.style.display = 'none'
            e.target.nextSibling.style.display = 'flex'
          }}
        />
      )}
      
      {/* Fallback: Generated gradient with initials */}
      <div 
        className="w-full h-full rounded-full flex items-center justify-center font-bold text-white shadow-lg"
        style={{ 
          display: tokenLogo ? 'none' : 'flex',
          background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`
        }}
      >
        {initials}
      </div>
    </div>
  )
}
