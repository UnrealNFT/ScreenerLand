import { useState } from 'react'
import { motion } from 'framer-motion'
import { FaRocket, FaCoins, FaUpload, FaTwitter, FaTelegram, FaGlobe, FaCheckCircle, FaExclamationTriangle, FaWallet } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { useWallet } from '../contexts/WalletContext'
import casperDeployService from '../services/casper.deploy.service'

export default function LaunchpadPage() {
  const { walletAddress, isConnected } = useWallet()
  const [step, setStep] = useState(1) // 1: Form, 2: Review, 3: Deploy, 4: Success
  
  // Token Form Data
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    totalSupply: '1000000000', // Fixed 1 billion like Pump.fun
    decimals: '9', // Fixed 9 decimals
    description: '',
    logoFile: null,
    logoPreview: null,
    twitter: '',
    telegram: '',
    website: '',
    enableSocial: true, // Enable comments/reactions
    initialBuyCSPR: 0 // Initial purchase amount (0 = no buy, min 0.01 CSPR)
  })
  
  const [errors, setErrors] = useState({})
  const [deploying, setDeploying] = useState(false)
  const [deployHash, setDeployHash] = useState(null)
  const [deployProgress, setDeployProgress] = useState('')
  
  // Handle form input changes
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }
  
  // Handle logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast.error('Logo must be under 2MB')
        return
      }
      
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          logoFile: file,
          logoPreview: reader.result
        }))
      }
      reader.readAsDataURL(file)
    }
  }
  
  // Validate form
  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.name.trim()) newErrors.name = 'Token name is required'
    if (!formData.symbol.trim()) newErrors.symbol = 'Symbol is required'
    if (formData.symbol.length > 10) newErrors.symbol = 'Symbol must be 10 chars or less'
    if (!formData.description.trim()) newErrors.description = 'Description is required'
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }
  
  // Go to review step
  const handleNext = () => {
    if (!isConnected) {
      toast.error('Please connect your wallet first')
      return
    }
    
    if (validateForm()) {
      setStep(2)
    } else {
      toast.error('Please fix the errors')
    }
  }
  
  // Deploy token (Manual deployment with instructions)
  const handleDeploy = async () => {
    setStep(3)
    setDeploying(true)
    setDeployProgress('Preparing deployment instructions...')
    
    try {
      // Prepare token data
      const tokenConfig = {
        name: formData.name,
        symbol: formData.symbol,
        totalSupply: formData.totalSupply,
        decimals: formData.decimals,
        initialBuyCSPR: formData.initialBuyCSPR > 0 ? formData.initialBuyCSPR : null
      }
      
      setDeployProgress('Generating deploy parameters...')
      
      // Get deployment instructions
      const hash = await casperDeployService.deployToken(
        tokenConfig,
        walletAddress,
        null
      )
      
      setDeployHash(hash)
      setDeployProgress('Instructions ready!')
      
      // Store token metadata
      const metadata = {
        deployHash: hash,
        name: formData.name,
        symbol: formData.symbol,
        totalSupply: formData.totalSupply,
        decimals: formData.decimals,
        description: formData.description,
        logo: formData.logoPreview,
        socials: {
          twitter: formData.twitter,
          telegram: formData.telegram,
          website: formData.website
        },
        socialEnabled: formData.enableSocial,
        initialBuyCSPR: formData.initialBuyCSPR,
        creator: walletAddress,
        timestamp: new Date().toISOString()
      }
      
      console.log('✅ Token prepared:', metadata)
      
      await new Promise(r => setTimeout(r, 1000))
      
      setStep(4)
      toast.success('Token prepared for deployment! 📋')
      
    } catch (error) {
      console.error('Preparation error:', error)
      toast.error(`Failed to prepare: ${error.message}`)
      setStep(2)
    } finally {
      setDeploying(false)
      setDeployProgress('')
    }
  }
  
  // Calculate costs (REAL estimate)
  const estimatedCost = {
    ...casperDeployService.estimateCost(),
    initialBuy: formData.initialBuyCSPR,
    total: casperDeployService.estimateCost().total + formData.initialBuyCSPR
  }

  return (
    <div className="min-h-screen pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <motion.div 
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <FaRocket className="text-5xl text-primary animate-bounce" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
              TOKEN LAUNCHPAD
            </h1>
            <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm font-bold border border-orange-500/50">
              Manual Deploy
            </span>
          </div>
          <p className="text-white/60 text-lg">
            🎯 Create your CEP-18 token | 💎 Fair launch | 👥 Social enabled
          </p>
          <p className="text-white/40 text-sm mt-2">
            ⚠️ Automated deployment coming soon (SDK v5 integration in progress)
          </p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div 
          className="glass rounded-2xl p-6 mb-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center justify-between relative">
            {/* Progress Line */}
            <div className="absolute top-5 left-0 w-full h-1 bg-white/10" />
            <div 
              className="absolute top-5 left-0 h-1 bg-gradient-to-r from-primary to-secondary transition-all duration-500"
              style={{ width: `${((step - 1) / 3) * 100}%` }}
            />
            
            {/* Steps */}
            {[
              { num: 1, label: 'Info', icon: FaCoins },
              { num: 2, label: 'Review', icon: FaCheckCircle },
              { num: 3, label: 'Deploy', icon: FaRocket },
              { num: 4, label: 'Success', icon: FaCheckCircle }
            ].map((s) => (
              <div key={s.num} className="relative flex flex-col items-center z-10">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                    step >= s.num 
                      ? 'bg-gradient-to-br from-primary to-secondary text-white' 
                      : 'bg-dark-hover text-white/40'
                  }`}
                >
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className={`mt-2 text-sm font-semibold ${step >= s.num ? 'text-white' : 'text-white/40'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Wallet Connection Banner */}
        {!isConnected && (
          <motion.div 
            className="glass rounded-2xl p-6 mb-6 border-2 border-orange-500/50"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4">
              <FaWallet className="text-4xl text-orange-500" />
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Connect Your Wallet</h3>
                <p className="text-white/60 text-sm">
                  Use the "Connect Wallet" button in the top right to deploy tokens on Casper Network
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 1: Form */}
        {step === 1 && (
          <motion.div 
            className="glass rounded-2xl p-8 space-y-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">Token Information</h2>
            
            {/* Token Name */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Token Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Degen Coin"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full px-4 py-3 bg-dark-hover rounded-xl text-white outline-none focus:ring-2 transition-all ${
                  errors.name ? 'ring-2 ring-red-500' : 'focus:ring-primary'
                }`}
              />
              {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
            </div>
            
            {/* Symbol */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Symbol <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. DEGEN"
                value={formData.symbol}
                onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
                maxLength={10}
                className={`w-full px-4 py-3 bg-dark-hover rounded-xl text-white outline-none focus:ring-2 transition-all ${
                  errors.symbol ? 'ring-2 ring-red-500' : 'focus:ring-primary'
                }`}
              />
              {errors.symbol && <p className="text-red-400 text-sm mt-1">{errors.symbol}</p>}
            </div>
            
            {/* Fixed Supply & Decimals Info */}
            <div className="glass-inner rounded-xl p-4 border-l-4 border-primary">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/60 text-sm mb-1">Total Supply (Fixed)</p>
                  <p className="text-white font-bold text-lg">1,000,000,000</p>
                  <p className="text-primary text-xs">Same as Pump.fun 🚀</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm mb-1">Decimals (Fixed)</p>
                  <p className="text-white font-bold text-lg">9</p>
                  <p className="text-primary text-xs">Standard precision</p>
                </div>
              </div>
              <p className="text-white/40 text-xs mt-3">
                ℹ️ Fair launch: All tokens go to creator. No presale, no team allocation.
              </p>
            </div>
            
            {/* Description */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Tell the community about your token..."
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={4}
                className={`w-full px-4 py-3 bg-dark-hover rounded-xl text-white outline-none focus:ring-2 transition-all resize-none ${
                  errors.description ? 'ring-2 ring-red-500' : 'focus:ring-primary'
                }`}
              />
              {errors.description && <p className="text-red-400 text-sm mt-1">{errors.description}</p>}
            </div>
            
            {/* Logo Upload */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Token Logo (Optional)
              </label>
              <div className="flex items-center gap-4">
                {formData.logoPreview && (
                  <img 
                    src={formData.logoPreview} 
                    alt="Logo preview"
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/50"
                  />
                )}
                <label className="flex-1 px-4 py-3 bg-dark-hover rounded-xl text-white/60 cursor-pointer hover:bg-dark-hover/80 transition-all border-2 border-dashed border-white/20 hover:border-primary/50 text-center">
                  <FaUpload className="inline-block mr-2" />
                  {formData.logoFile ? formData.logoFile.name : 'Choose image (PNG, JPG, max 2MB)'}
                  <input 
                    type="file" 
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            
            {/* Social Links */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Social Links (Optional)</h3>
              
              <div>
                <label className="block text-white/80 mb-2 flex items-center gap-2">
                  <FaTwitter className="text-blue-400" />
                  Twitter / X
                </label>
                <input
                  type="url"
                  placeholder="https://x.com/yourproject"
                  value={formData.twitter}
                  onChange={(e) => handleChange('twitter', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-hover rounded-xl text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              
              <div>
                <label className="block text-white/80 mb-2 flex items-center gap-2">
                  <FaTelegram className="text-blue-500" />
                  Telegram
                </label>
                <input
                  type="url"
                  placeholder="https://t.me/yourproject"
                  value={formData.telegram}
                  onChange={(e) => handleChange('telegram', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-hover rounded-xl text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              
              <div>
                <label className="block text-white/80 mb-2 flex items-center gap-2">
                  <FaGlobe className="text-green-500" />
                  Website
                </label>
                <input
                  type="url"
                  placeholder="https://yourproject.com"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-hover rounded-xl text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
            </div>
            
            {/* Social Network Toggle */}
            <div className="glass-inner rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-bold mb-1">Enable Social Features 👥</h4>
                  <p className="text-white/60 text-sm">Allow comments, reactions, and community engagement</p>
                </div>
                <button
                  onClick={() => handleChange('enableSocial', !formData.enableSocial)}
                  className={`w-16 h-8 rounded-full transition-all ${
                    formData.enableSocial ? 'bg-primary' : 'bg-white/20'
                  }`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full transition-transform ${
                    formData.enableSocial ? 'translate-x-9' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
            
            {/* Initial Purchase - Simple Style */}
            <div className="glass rounded-2xl p-6 border-2 border-primary/30">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-white mb-2">🚀 Initial Purchase</h3>
                <p className="text-white/60 text-sm">
                  Buy tokens immediately when creating (optional)
                </p>
              </div>
              
              <div className="space-y-4">
                {/* Simple Amount Display */}
                <div className="text-center mb-4">
                  <div className="text-white/60 text-sm mb-2">Amount</div>
                  <div className="text-primary text-4xl font-bold">
                    {formData.initialBuyCSPR === 0 ? 'None' : `${formData.initialBuyCSPR} CSPR`}
                  </div>
                </div>
                
                {/* Simple Buttons: None, 10, 100, 1000 */}
                <div className="grid grid-cols-4 gap-3">
                  {[0, 10, 100, 1000].map(amount => (
                    <button
                      key={amount}
                      onClick={() => handleChange('initialBuyCSPR', amount)}
                      className={`px-4 py-4 rounded-xl font-bold text-lg transition-all ${
                        formData.initialBuyCSPR === amount
                          ? 'bg-gradient-to-r from-primary to-secondary text-white scale-105 shadow-lg shadow-primary/50'
                          : 'glass text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {amount === 0 ? 'None' : amount}
                    </button>
                  ))}
                </div>
                
                {/* Simple Progress Bar */}
                {formData.initialBuyCSPR > 0 && (
                  <div className="mt-4">
                    <div className="h-3 bg-dark-hover rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
                        style={{ width: `${Math.min((formData.initialBuyCSPR / 1000) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Estimated Tokens Out */}
                {formData.initialBuyCSPR > 0 && (
                  <div className="glass-inner rounded-xl p-4 border-l-4 border-primary">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/60 text-sm">You will receive (estimated):</span>
                      <span className="text-white font-bold text-lg">
                        {(() => {
                          // Simple estimation: ~950k tokens per CSPR
                          const tokensOut = formData.initialBuyCSPR * 950000
                          return `~${Math.floor(tokensOut).toLocaleString()} ${formData.symbol || 'tokens'}`
                        })()}
                      </span>
                    </div>
                    <p className="text-white/40 text-xs mt-2">
                      💡 Tokens will be sent to your wallet immediately after deployment
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Next Button */}
            <button
              onClick={handleNext}
              disabled={!isConnected}
              className="w-full px-6 py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-bold text-white hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Review →
            </button>
          </motion.div>
        )}

        {/* STEP 2: Review */}
        {step === 2 && (
          <motion.div 
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            {/* Review Card */}
            <div className="glass rounded-2xl p-8 space-y-6">
              <h2 className="text-2xl font-bold text-white mb-4">Review Your Token</h2>
              
              {/* Token Preview */}
              <div className="glass-inner rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-4">
                  {formData.logoPreview ? (
                    <img 
                      src={formData.logoPreview} 
                      alt={formData.name}
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/50"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl font-bold">
                      {formData.symbol.substring(0, 2)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-bold text-white">{formData.name}</h3>
                    <p className="text-white/60">{formData.symbol}</p>
                  </div>
                </div>
                
                <p className="text-white/80">{formData.description}</p>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-white/40 text-sm">Total Supply</p>
                    <p className="text-white font-bold text-lg">{Number(formData.totalSupply).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-white/40 text-sm">Decimals</p>
                    <p className="text-white font-bold text-lg">{formData.decimals}</p>
                  </div>
                </div>
                
                {/* Social Links */}
                {(formData.twitter || formData.telegram || formData.website) && (
                  <div className="flex gap-3 pt-4 border-t border-white/10">
                    {formData.twitter && (
                      <a href={formData.twitter} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all">
                        <FaTwitter className="inline mr-2" />
                        Twitter
                      </a>
                    )}
                    {formData.telegram && (
                      <a href={formData.telegram} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-all">
                        <FaTelegram className="inline mr-2" />
                        Telegram
                      </a>
                    )}
                    {formData.website && (
                      <a href={formData.website} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all">
                        <FaGlobe className="inline mr-2" />
                        Website
                      </a>
                    )}
                  </div>
                )}
                
                {/* Social Features Badge */}
                {formData.enableSocial && (
                  <div className="px-4 py-2 bg-primary/20 text-primary rounded-lg inline-flex items-center gap-2">
                    👥 Social features enabled
                  </div>
                )}
              </div>
            </div>
            
            {/* Cost Estimate */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Deployment Cost</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-white/80">
                  <span>Contract Deployment</span>
                  <span className="font-semibold">{estimatedCost.contractDeploy} CSPR</span>
                </div>
                <div className="flex justify-between text-white/80">
                  <span>Gas Fee (estimate)</span>
                  <span className="font-semibold">{estimatedCost.gas} CSPR</span>
                </div>
                {formData.initialBuyCSPR > 0 && (
                  <div className="flex justify-between text-primary">
                    <span className="flex items-center gap-2">
                      🚀 Initial Purchase
                    </span>
                    <span className="font-bold">{formData.initialBuyCSPR} CSPR</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-3 flex justify-between text-white font-bold text-lg">
                  <span>Total Cost</span>
                  <span className="text-primary">{estimatedCost.total.toFixed(2)} CSPR</span>
                </div>
                {formData.initialBuyCSPR > 0 && (
                  <p className="text-white/40 text-xs pt-2">
                    💡 You'll receive your tokens immediately after deployment!
                  </p>
                )}
              </div>
            </div>
            
            {/* Warning */}
            <div className="glass-inner rounded-xl p-4 border-l-4 border-orange-500">
              <div className="flex gap-3">
                <FaExclamationTriangle className="text-orange-500 text-xl flex-shrink-0 mt-1" />
                <div>
                  <p className="text-white font-semibold mb-1">Important Notice</p>
                  <p className="text-white/60 text-sm">
                    Once deployed, token information cannot be changed. Please review carefully before proceeding.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-6 py-4 glass rounded-xl font-bold text-white hover:bg-white/10 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={handleDeploy}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-bold text-white hover:scale-105 transition-transform"
              >
                Prepare Token 📋
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: Deploying */}
        {step === 3 && (
          <motion.div 
            className="glass rounded-2xl p-12 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="inline-block animate-spin text-8xl mb-6">⚙️</div>
            <h2 className="text-3xl font-bold text-white mb-4">Preparing Token...</h2>
            <p className="text-white/60 text-lg mb-4">
              Generating deployment instructions
            </p>
            <p className="text-primary font-semibold mb-8">
              {deployProgress}
            </p>
            <div className="w-64 h-2 bg-white/10 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-secondary animate-pulse" style={{ width: '70%' }} />
            </div>
            <p className="text-white/40 text-sm mt-6">
              This will take just a moment...
            </p>
          </motion.div>
        )}

        {/* STEP 4: Success */}
        {step === 4 && (
          <motion.div 
            className="glass rounded-2xl p-12 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="text-8xl mb-6">📋</div>
            <h2 className="text-4xl font-bold text-white mb-4">Token Prepared!</h2>
            <p className="text-white/60 text-lg mb-8">
              Your token <span className="text-primary font-bold">{formData.symbol}</span> is ready for deployment
            </p>
            
            <div className="glass-inner rounded-xl p-6 mb-8 max-w-2xl mx-auto text-left">
              <p className="text-white font-semibold mb-4 text-center">📝 Deployment Instructions</p>
              <div className="text-white/80 text-sm space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">1.</span>
                  <span>Go to <a href="https://testnet.cspr.live" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">testnet.cspr.live</a></span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">2.</span>
                  <span>Connect your Casper Wallet</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">3.</span>
                  <span>Navigate to: <code className="bg-dark-hover px-2 py-1 rounded">Tools → Deploy → Install Contract</code></span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">4.</span>
                  <span>Download and upload the <a href="/cep18.wasm" download className="text-primary hover:underline">CEP-18 WASM file</a></span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">5.</span>
                  <div>
                    <div>Set contract arguments:</div>
                    <div className="mt-2 space-y-1 ml-4">
                      <div className="font-mono text-xs bg-dark-hover px-2 py-1 rounded">name: "{formData.name}"</div>
                      <div className="font-mono text-xs bg-dark-hover px-2 py-1 rounded">symbol: "{formData.symbol}"</div>
                      <div className="font-mono text-xs bg-dark-hover px-2 py-1 rounded">decimals: {formData.decimals}</div>
                      <div className="font-mono text-xs bg-dark-hover px-2 py-1 rounded">total_supply: {formData.totalSupply}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">6.</span>
                  <span>Set payment amount: <code className="bg-dark-hover px-2 py-1 rounded">250 CSPR</code></span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold">7.</span>
                  <span>Sign and deploy your token! 🚀</span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-white/40 text-xs text-center">
                  💡 Automated deployment coming soon! SDK v5 integration in progress.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setStep(1)
                  setFormData({
                    name: '',
                    symbol: '',
                    totalSupply: '1000000000',
                    decimals: '9',
                    description: '',
                    logoFile: null,
                    logoPreview: null,
                    twitter: '',
                    telegram: '',
                    website: '',
                    enableSocial: true,
                    initialBuyCSPR: 0
                  })
                  setDeployHash(null)
                }}
                className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-bold text-white hover:scale-105 transition-transform"
              >
                Create Another Token 🚀
              </button>
              <a
                href="/screener"
                className="px-8 py-4 glass rounded-xl font-bold text-white hover:bg-white/10 transition-all"
              >
                Back to Screener
              </a>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  )
}
