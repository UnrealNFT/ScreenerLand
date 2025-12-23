// Generate consistent gradient colors for tokens based on their contract hash
// This ensures the same token always has the same color across the app
export const getTokenColor = (contractHash) => {
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

// Generate gradient style object
export const getTokenGradientStyle = (contractHash) => {
  const colors = getTokenColor(contractHash)
  return {
    background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`
  }
}
