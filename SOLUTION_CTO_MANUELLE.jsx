// ============================================
// SOLUTION MANUELLE FIABLE POUR LE PAIEMENT CTO
// ============================================
// À copier-coller dans StoryUpload.jsx

// 1. AJOUTER CES STATES (ligne ~30)
const [showPaymentModal, setShowPaymentModal] = useState(false)
const [txHashInput, setTxHashInput] = useState('')
const [copiedAddress, setCopiedAddress] = useState(false)

// 2. REMPLACER LA FONCTION claimCTO (ligne ~115)
const claimCTO = async () => {
  if (!walletAddress) {
    toast.error('Connect wallet first')
    return
  }

  // Ouvrir la modal - c'est tout !
  setShowPaymentModal(true)
}

// 3. AJOUTER CETTE NOUVELLE FONCTION
const handleVerifyPayment = async () => {
  if (!txHashInput || txHashInput.trim().length < 60) {
    toast.error('Hash invalide - doit faire au moins 60 caractères')
    return
  }

  setIsClaimingCTO(true)
  const CTO_PRICE = 10

  try {
    const packageHash = tokenData.packageHash || 
      tokenData.contract_package_hash?.replace(/^hash-/, '') || 
      tokenData.contractPackageHash?.replace(/^hash-/, '')
    
    const txHash = txHashInput.trim()
    console.log('💰 Vérification du hash:', txHash)
    toast.loading('Vérification du paiement sur la blockchain...')

    // Appel au backend pour vérifier
    const response = await fetch('http://localhost:3001/api/stories/claim-cto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenHash: packageHash,
        tokenOwner: tokenData.owner,
        walletAddress,
        amount: CTO_PRICE,
        txHash: txHash
      })
    })

    const data = await response.json()

    if (data.success) {
      toast.success('🎉 CTO Access granted!')
      setShowPaymentModal(false)
      setTxHashInput('')
      setAccessStatus('cto-owned')
      await checkAccess()
    } else {
      throw new Error(data.error || 'Failed to verify payment')
    }
  } catch (error) {
    console.error('❌ Error:', error)
    toast.error(`Failed: ${error.message}`)
    await checkAccess()
  } finally {
    setIsClaimingCTO(false)
  }
}

// 4. AJOUTER FONCTION POUR COPIER
const copyAddress = () => {
  const addr = '0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8'
  navigator.clipboard.writeText(addr)
  setCopiedAddress(true)
  toast.success('Adresse copiée !', { duration: 2000 })
  setTimeout(() => setCopiedAddress(false), 2000)
}

// 5. AJOUTER CETTE MODAL AVANT LE DERNIER </motion.div>
{/* MODAL DE PAIEMENT - BELLE INTERFACE */}
<AnimatePresence>
  {showPaymentModal && (
    <motion.div
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setShowPaymentModal(false)}
    >
      <motion.div
        className="glass rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <FaCoins className="text-yellow-400 text-3xl" />
            Claim CTO Access
          </h2>
          <button
            onClick={() => setShowPaymentModal(false)}
            className="w-10 h-10 glass-inner rounded-full flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <FaTimes className="text-white/60" />
          </button>
        </div>

        {/* Instructions Step by Step */}
        <div className="bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border-2 border-yellow-500/30 rounded-xl p-6 mb-6">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <span className="text-2xl">📋</span>
            Instructions
          </h3>
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 text-black font-bold flex items-center justify-center flex-shrink-0">
                1
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Ouvrez votre Casper Wallet</p>
                <p className="text-white/70 text-sm">Extension navigateur ou application mobile</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 text-black font-bold flex items-center justify-center flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold mb-2">Envoyez 10 CSPR à cette adresse</p>
                <div className="bg-black/40 rounded-lg p-3 mb-2 relative">
                  <p className="text-white/90 text-xs font-mono break-all pr-20">
                    0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8
                  </p>
                  <button
                    onClick={copyAddress}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md font-bold text-sm transition-all ${
                      copiedAddress
                        ? 'bg-green-500 text-white'
                        : 'bg-yellow-500 hover:bg-yellow-400 text-black'
                    }`}
                  >
                    {copiedAddress ? '✓ Copié' : 'Copier'}
                  </button>
                </div>
                <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg p-3">
                  <p className="text-yellow-200 font-bold text-lg">
                    💰 Montant : <span className="text-2xl">10 CSPR</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 text-black font-bold flex items-center justify-center flex-shrink-0">
                3
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Copiez le hash de transaction</p>
                <p className="text-white/70 text-sm">Disponible après confirmation dans votre wallet</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 text-black font-bold flex items-center justify-center flex-shrink-0">
                4
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Collez le hash ci-dessous</p>
                <p className="text-white/70 text-sm">On vérifiera le paiement sur la blockchain</p>
              </div>
            </div>
          </div>
        </div>

        {/* Input Hash */}
        <div className="mb-6">
          <label className="block text-white font-semibold mb-3 text-lg">
            Transaction Hash
          </label>
          <input
            type="text"
            value={txHashInput}
            onChange={(e) => setTxHashInput(e.target.value)}
            placeholder="Collez le hash ici (ex: a3f5d2b8c9e1f4...)"
            className="w-full bg-black/40 border-2 border-white/20 focus:border-yellow-500/60 rounded-xl px-4 py-4 text-white placeholder-white/40 focus:outline-none transition-all font-mono text-sm"
            disabled={isClaimingCTO}
          />
          <p className="text-white/50 text-xs mt-2">
            Le hash doit faire au moins 60 caractères
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowPaymentModal(false)
              setTxHashInput('')
            }}
            disabled={isClaimingCTO}
            className="flex-1 glass-inner rounded-xl px-6 py-4 text-white/60 hover:text-white hover:bg-white/10 transition-all font-semibold disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleVerifyPayment}
            disabled={isClaimingCTO || !txHashInput || txHashInput.length < 60}
            className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 rounded-xl px-6 py-4 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isClaimingCTO ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Vérification...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <FaCheck />
                Vérifier le paiement
              </span>
            )}
          </button>
        </div>

        {/* Security Note */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-300 text-sm text-center flex items-center justify-center gap-2">
            <span>🔒</span>
            <span>Paiement vérifié sur la blockchain Casper - 100% sécurisé</span>
          </p>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
