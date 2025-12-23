import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaUpload, FaTimes, FaPlay, FaPause, FaVideo, FaImage, FaCheck, FaLock, FaCoins, FaInfoCircle, FaFlag, FaGlobe, FaTelegram } from 'react-icons/fa'
import { SiX } from 'react-icons/si'
import { useWallet } from '../contexts/WalletContext'
import toast from 'react-hot-toast'
import { CLPublicKey, CLValueBuilder, DeployUtil, CasperClient } from 'casper-js-sdk'
import { getCTOConfig, fetchCTOConfig } from '../config/cto.config'

const CTO_PRICE = 1000 // 1000 CSPR for CTO access

export default function StoryUpload({ tokenData, onUploadComplete, onClose }) {
  const { walletAddress, network } = useWallet()
  const ctoConfig = getCTOConfig(network)
  const isTestnet = network === 'testnet'
  
  const [activeMode, setActiveMode] = useState('story') // 'story' | 'info' | 'banner'
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaType, setMediaType] = useState(null) // 'video' | 'image' | 'gif'
  const [caption, setCaption] = useState('')
  const [overlayText, setOverlayText] = useState('') // Text overlay on media
  const [isUploading, setIsUploading] = useState(false)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingMode, setRecordingMode] = useState('photo') // 'photo' | 'video'
  const [accessStatus, setAccessStatus] = useState('checking') // 'checking' | 'owner' | 'cto-needed' | 'cto-owned' | 'no-access'
  const [isClaimingCTO, setIsClaimingCTO] = useState(false)
  const [reclaimInfo, setReclaimInfo] = useState(null) // Info about current holder inactivity
  const [inactivityWarning, setInactivityWarning] = useState(null) // Warning when user is close to becoming inactive
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [pendingPayment, setPendingPayment] = useState(null) // {deployHash, tokenHash, timestamp}
  const [checkingPayment, setCheckingPayment] = useState(false)
  
  // Info update states
  const [website, setWebsite] = useState(tokenData?.website || '')
  const [xLink, setXLink] = useState(tokenData?.twitter || tokenData?.x || '')
  const [telegram, setTelegram] = useState(tokenData?.telegram || '')
  
  // Banner update states
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(tokenData?.banner || null)
  
  // Danger Zone states
  const [isDeletingStories, setIsDeletingStories] = useState(false)
  const [isDeletingCTO, setIsDeletingCTO] = useState(false)
  
  const mediaInputRef = useRef(null)
  const mediaPreviewRef = useRef(null)
  const videoStreamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const bannerInputRef = useRef(null)

  // Load CTO config from backend (optional optimization)
  useEffect(() => {
    fetchCTOConfig().catch(() => {
      console.log('Using default CTO config')
    })
  }, [])

  useEffect(() => {
    if (walletAddress && tokenData) {
      checkAccess()
      
      // Check for pending payment in localStorage
      const stored = localStorage.getItem('pendingCTOPayment')
      if (stored) {
        try {
          const payment = JSON.parse(stored)
          const currentTokenHash = (tokenData.packageHash || tokenData.contract_package_hash || tokenData.contractPackageHash || '').replace(/^hash-/, '').toLowerCase()
          const paymentTokenHash = (payment.tokenHash || '').replace(/^hash-/, '').toLowerCase()
          
          // Only show if it's for THIS token AND less than 10 minutes old
          if (currentTokenHash === paymentTokenHash && Date.now() - payment.timestamp < 10 * 60 * 1000) {
            setPendingPayment(payment)
          } else if (currentTokenHash !== paymentTokenHash) {
            // Different token, ctoConfigLoaded - don't show
            setPendingPayment(null)
          } else {
            // Too old - remove from storage
            localStorage.removeItem('pendingCTOPayment')
            setPendingPayment(null)
          }
        } catch (e) {
          localStorage.removeItem('pendingCTOPayment')
          setPendingPayment(null)
        }
      } else {
        setPendingPayment(null)
      }
    }
  }, [walletAddress, tokenData])

  const checkAccess = async () => {
    try {
      setAccessStatus('checking')
      
      // Check if user is the token owner
      const isOwner = walletAddress.toLowerCase() === tokenData.owner?.toLowerCase()
      
      if (isOwner) {
        console.log('✅ User is token owner - FREE access')
        setAccessStatus('owner')
        return
      }

      // Check if user has purchased CTO access
      // 🔥 Use PACKAGE HASH, not contract hash (database stores package hash)
      const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
      
      if (!packageHash) {
        console.error('❌ No package hash available!', tokenData)
        setAccessStatus('no-access')
        return
      }
      
      const response = await fetch(`http://localhost:3001/api/stories/cto-access/${packageHash}/${walletAddress}`)
      const data = await response.json()
      
      console.log('🔍 CTO Access check:', { hasAccess: data.hasAccess, wallet: walletAddress, packageHash })
      
      if (data.success && data.hasAccess) {
        console.log('✅ User has CTO access')
        setAccessStatus('cto-owned')
        
        // Check inactivity status
        const inactivityResponse = await fetch('http://localhost:3001/api/stories/check-my-inactivity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenHash: packageHash,
            walletAddress: walletAddress,
            network: network
          })
        })
        
        if (inactivityResponse.ok) {
          const inactivityData = await inactivityResponse.json()
          if (inactivityData.warning) {
            setInactivityWarning(inactivityData)
          }
        }
        
        return
      }
      
      // If no access, check reclaim status
      // Check if CTO can be reclaimed (current holder inactive 90+ days)
      const reclaimResponse = await fetch('http://localhost:3001/api/stories/can-reclaim-cto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash: packageHash, // Use package hash from above
          tokenOwner: tokenData.owner
        })
      })
      
      const reclaimData = await reclaimResponse.json()
      
      if (reclaimData.success) {
        setReclaimInfo(reclaimData)
        console.log('ℹ️ Reclaim status:', reclaimData)
      }
      
      console.log('⚠️ User needs to purchase CTO access (10 CSPR)')
      setAccessStatus('cto-needed')
    } catch (error) {
      console.error('❌ Error checking access:', error)
      setAccessStatus('no-access')
    }
  }

  const claimCTO = async () => {
    console.log('🔥 claimCTO called!', { walletAddress, showPaymentModal })
    
    if (!walletAddress) {
      toast.error('Connect wallet first')
      return
    }

    // Vérifier que Casper Wallet est disponible
    if (typeof window.CasperWalletProvider !== 'function') {
      toast.error('Casper Wallet not found! Please install the extension.')
      window.open('https://www.casperwallet.io/', '_blank')
      return
    }

    setIsClaimingCTO(true)

    try {
      // 🔒 CRITICAL: Check if CTO is available BEFORE spending CSPR
      toast.loading('Checking CTO availability...', { id: 'cto-check' })
      
      const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
      
      const availabilityCheck = await fetch('http://localhost:3001/api/stories/check-cto-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash: packageHash,
          network: network
        })
      })
      
      const availabilityData = await availabilityCheck.json()
      toast.dismiss('cto-check')
      
      if (!availabilityData.available) {
        // ❌ CTO déjà pris par quelqu'un d'ACTIF
        const daysRemaining = availabilityData.daysRemaining || 90
        toast.error(
          `❌ CTO Access is currently held by an ACTIVE user.\n\n` +
          `Current holder: ${availabilityData.currentHolder}\n` +
          `Days since last activity: ${availabilityData.daysSinceActivity || 0}\n\n` +
          `They must be inactive for 90 days before you can reclaim.\n` +
          `Days remaining: ${daysRemaining}`,
          { duration: 10000 }
        )
        setIsClaimingCTO(false)
        return // 🛑 STOP - Don't allow payment!
      }
      
      console.log('✅ CTO is available - proceeding with payment')
      
      // Show network confirmation
      toast(`🌐 Payment on ${network.toUpperCase()}: ${ctoConfig.price} CSPR`, { 
        icon: network === 'mainnet' ? '💰' : '🧪',
        duration: 3000
      })
      
      toast.loading('Opening Casper Wallet...', { id: 'cto-payment' })

      // Utiliser l'API native de Casper Wallet pour les transferts
      const provider = window.CasperWalletProvider()
      
      // Casper Wallet supporte directement les transferts natifs
      const deployParams = {
        amount: ctoConfig.priceMotes,
        target: ctoConfig.receiverWallet,
        transferId: Date.now().toString() // ID unique basé sur timestamp
      }
      
      console.log('📤 Requesting native transfer:', deployParams)
      
      // Utiliser signAndSendTransfer si disponible, sinon fallback sur sign
      let deployHash
      
      if (typeof provider.signAndSendTransfer === 'function') {
        // Méthode directe: signe ET envoie
        const result = await provider.signAndSendTransfer(deployParams)
        deployHash = result.deployHash
      } else {
        // Fallback: construire manuellement le deploy
        const publicKey = CLPublicKey.fromHex(walletAddress)
        const targetKey = CLPublicKey.fromHex(ctoConfig.receiverWallet)
        
        // Utiliser le chain name du wallet
        const provider = window.CasperWalletProvider()
        await provider.requestConnection()
        const isConnected = await provider.isConnected()
        
        console.log(`🔗 Chain name: ${ctoConfig.chainName} | Network: ${network} | Connected: ${isConnected}`)
        
        const deployParamsSDK = new DeployUtil.DeployParams(
          publicKey,
          ctoConfig.chainName,
          1,
          1800000
        )
        
        const transferArgs = DeployUtil.ExecutableDeployItem.newTransfer(
          ctoConfig.priceMotes,
          targetKey,
          null,
          parseInt(deployParams.transferId)
        )
        
        const payment = DeployUtil.standardPayment(100000000)
        const deploy = DeployUtil.makeDeploy(deployParamsSDK, transferArgs, payment)
        const deployJSON = DeployUtil.deployToJson(deploy)
        
        // Signer avec Casper Wallet - retourne SEULEMENT la signature
        const signedResult = await provider.sign(JSON.stringify(deployJSON), walletAddress)
        
        if (!signedResult || signedResult.cancelled) {
          throw new Error('Payment cancelled')
        }
        
        console.log('🔍 Signed result:', signedResult)
        
        // Le wallet retourne juste la signature, il faut la combiner avec le deploy original
        if (signedResult.signature) {
          // Convertir la signature en hex
          const signatureHex = Array.from(signedResult.signature)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
          
          // Calculer le hash du deploy
          deployHash = Array.from(deploy.hash)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
          
          console.log('✅ Deploy hash:', deployHash)
          console.log('🔐 Signature (hex):', signatureHex)
          
          // Construire manuellement le deploy signé en JSON
          const deployJson = DeployUtil.deployToJson(deploy)
          
          // IMPORTANT: Convertir les clés en minuscules (RPC les veut en lowercase)
          deployJson.deploy.header.account = deployJson.deploy.header.account.toLowerCase()
          
          // Déterminer l'algorithme à partir du préfixe de la clé publique
          const keyPrefix = walletAddress.substring(0, 2)
          
          // Ajouter manuellement l'approbation avec la signature en hex + préfixe d'algo
          deployJson.deploy.approvals = [{
            signer: publicKey.toHex().toLowerCase(),  // LOWERCASE!
            signature: keyPrefix + signatureHex  // PREFIXE (01 ou 02) + signature
          }]
          
          // Envoyer le deploy signé via le backend (évite les problèmes CORS)
          console.log('📡 Sending deploy via backend...')
          console.log('📦 Deploy JSON to send:', JSON.stringify(deployJson, null, 2))
          
          const response = await fetch('http://localhost:3001/api/casper/send-deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deployJson })
          })
          
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to send deploy')
          }
          
          const { deployHash: confirmedHash } = await response.json()
          console.log('✅ Deploy sent to blockchain:', confirmedHash)
          
          // Lier et vérifier le paiement (le backend va attendre que le deploy soit exécuté)
          console.log('🔐 Verifying payment on blockchain...')
          toast.loading('Verifying payment on blockchain...', { id: 'cto-payment' })
          
          const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
          
          const linkResponse = await fetch('http://localhost:3001/api/stories/link-cto-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokenHash: packageHash,
              walletAddress: walletAddress,
              deployHash: confirmedHash,
              network: network
            })
          })
          
          const linkData = await linkResponse.json()
          
          if (linkResponse.ok && linkData.verified) {
            console.log('✅ Payment verified and access granted!')
            toast.success('✅ CTO Access granted! Payment confirmed on blockchain!', { id: 'cto-payment' })
            setAccessStatus('cto-owned')
            setIsClaimingCTO(false)
            await checkAccess()
            return // Succès!
          } else if (linkResponse.status === 400 && linkData.currentHolder) {
            // 🔒 CTO déjà pris par quelqu'un d'ACTIF
            console.error('❌ CTO already held by active user:', linkData)
            toast.error(
              `❌ CTO Access is held by an ACTIVE user.\n\n` +
              `Current holder: ${linkData.currentHolder}\n` +
              `They must be inactive for 90 days before you can claim.\n\n` +
              `Days remaining: ${linkData.daysRemaining || 'N/A'}`,
              { id: 'cto-payment', duration: 8000 }
            )
            setIsClaimingCTO(false)
            return
          } else if (linkData.pending) {
            const networkDisplay = network === 'mainnet' ? 'Mainnet' : 'Testnet'
            console.warn(`⏳ Payment still pending on ${networkDisplay}`)
            toast.dismiss('cto-payment')
            toast(`⏳ Payment sent successfully to ${networkDisplay}!\n\n${networkDisplay} confirmation is taking longer than expected. Refresh the page in 1-2 minutes to check status.`, { 
              duration: 10000,
              id: 'cto-pending',
              icon: '⏳'
            })
            setIsClaimingCTO(false)
            // Store deploy hash for later verification
            localStorage.setItem('pendingCTOPayment', JSON.stringify({
              deployHash: confirmedHash,
              tokenHash: packageHash,
              timestamp: Date.now()
            }))
            return
          } else if (linkData.failed) {
            toast.error('❌ Payment failed on blockchain: ' + linkData.error, { id: 'cto-payment' })
            setIsClaimingCTO(false)
            return
          } else {
            console.warn('⚠️ Could not verify payment immediately:', linkData.error)
            toast.loading('Payment sent, waiting for confirmation...', { id: 'cto-payment' })
          }
          
        } else {
          throw new Error('No signature returned from wallet')
        }
      }

      console.log('✅ Payment sent! Deploy hash:', deployHash)
      toast.success('Payment sent! Waiting for confirmation...', { id: 'cto-payment' })

      // Le backend va détecter automatiquement le paiement via le listener
      // On poll pour vérifier quand l'accès est accordé
      const startTime = Date.now()
      const maxWaitTime = 60000 // 1 minute max de polling après ça on laisse l'utilisateur refresh

      const checkInterval = setInterval(async () => {
        try {
          const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
          
          // Vérifier si l'accès a été accordé
          const accessCheck = await fetch(`http://localhost:3001/api/stories/check-access/${packageHash}/${walletAddress}?network=${network}`)
          const accessData = await accessCheck.json()

          if (accessData.hasCTOAccess) {
            clearInterval(checkInterval)
            toast.success('✅ CTO Access granted! Payment confirmed on blockchain!', { id: 'cto-payment' })
            setAccessStatus('cto-owned')
            setIsClaimingCTO(false)
            await checkAccess()
          } else if (Date.now() - startTime > maxWaitTime) {
            clearInterval(checkInterval)
            toast.error('Payment verification timeout. Check your transaction on cspr.live', { id: 'cto-payment' })
            setIsClaimingCTO(false)
          }
        } catch (error) {
          console.error('Error checking access:', error)
        }
      }, 3000) // Check every 3 seconds

    } catch (error) {
      console.error('❌ CTO payment error:', error)
      toast.error(error.message || 'Payment failed', { id: 'cto-payment' })
      setIsClaimingCTO(false)
    }
  }

  // Check status of a pending payment
  const checkPendingPayment = async () => {
    if (!pendingPayment) return
    
    setCheckingPayment(true)
    toast.loading('Checking payment status...', { id: 'check-payment' })
    
    try {
      const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
      
      const response = await fetch('http://localhost:3001/api/stories/link-cto-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash: packageHash,
          walletAddress: walletAddress,
          deployHash: pendingPayment.deployHash,
          network: network
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.verified) {
        toast.success('✅ Payment confirmed! Access granted!', { id: 'check-payment' })
        setAccessStatus('cto-owned')
        setPendingPayment(null)
        localStorage.removeItem('pendingCTOPayment')
        await checkAccess()
      } else if (data.pending) {
        toast('⏳ Still waiting for blockchain confirmation. Please try again in 1-2 minutes.', { 
          id: 'check-payment',
          duration: 6000,
          icon: '⏳'
        })
      } else if (data.failed) {
        toast.error('❌ Payment failed: ' + data.error, { id: 'check-payment' })
        setPendingPayment(null)
        localStorage.removeItem('pendingCTOPayment')
      } else {
        toast.error('Could not verify payment: ' + (data.error || 'Unknown error'), { id: 'check-payment' })
      }
    } catch (error) {
      console.error('Error checking payment:', error)
      toast.error('Failed to check payment status', { id: 'check-payment' })
    } finally {
      setCheckingPayment(false)
    }
  }

  // Vérifier le paiement
  const verifyPayment = async () => {
    if (!txHash || txHash.length < 60) {
      toast.error('Hash invalide')
      return
    }

    setIsClaimingCTO(true)
    
    try {
      const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
      
      toast.loading('Vérification...')
        
      // Record CTO purchase on backend with tx verification
      const response = await fetch('http://localhost:3001/api/stories/claim-cto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash: packageHash,
          tokenOwner: tokenData.owner,
          walletAddress,
          amount: CTO_PRICE,
          txHash: txHash // Send tx hash for verification
        })
      })

      const data = await response.json()

      if (data.success) {
        if (data.reclaimed) {
          const msg = data.reason === 'owner-inactive' 
            ? '♻️ CTO Reclaimed! Token owner was inactive. You now control stories!'
            : '♻️ CTO Reclaimed! Previous CTO holder was inactive. You now control stories!'
          toast.success(msg)
        } else {
          toast.success('✅ CTO Access granted!')
        }
        setShowPaymentModal(false)
        setTxHash('')
        setAccessStatus('cto-owned')
        await checkAccess()
      } else {
        throw new Error(data.error || 'Failed')
      }
    } catch (error) {
      toast.error(error.message)
      await checkAccess()
    } finally {
      setIsClaimingCTO(false)
    }
  }

  const handleMediaSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Check file type
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    
    if (!isVideo && !isImage) {
      toast.error('Please select a video or image file')
      return
    }

    // Check file size (max 100MB for video, 10MB for images)
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(`${isVideo ? 'Video' : 'Image'} is too large (max ${isVideo ? '100MB' : '10MB'})`)
      return
    }

    const fileType = file.type.includes('gif') ? 'gif' : (isVideo ? 'video' : 'image')
    setMediaType(fileType)
    setMediaFile(file)

    // Create preview
    const url = URL.createObjectURL(file)
    setMediaPreview(url)

    if (isVideo || fileType === 'gif') {
      // Get video/gif duration
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const dur = video.duration
        setDuration(dur)
        
        // Check duration (max 120 seconds)
        if (dur > 120) {
          toast.error('Video must be 120 seconds or less')
          setMediaFile(null)
          setMediaPreview(null)
          setMediaType(null)
          URL.revokeObjectURL(url)
        }
      }
      video.src = url
    } else {
      // Image: fixed 10 seconds duration
      setDuration(10)
      console.log('🖼️ Image selected - 10 sec duration')
    }
  }

  // Start camera for photo/video capture
  const startCamera = async (mode = 'photo') => {
    try {
      setRecordingMode(mode)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === 'video'
      })
      videoStreamRef.current = stream
      setShowCamera(true)
      
      if (mediaPreviewRef.current) {
        mediaPreviewRef.current.srcObject = stream
        mediaPreviewRef.current.play()
      }
    } catch (error) {
      console.error('Camera error:', error)
      toast.error('Could not access camera')
    }
  }

  // Stop camera
  const stopCamera = () => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop())
      videoStreamRef.current = null
    }
    setShowCamera(false)
    setIsRecording(false)
  }

  // Take photo
  const takePhoto = () => {
    if (!videoStreamRef.current) return
    
    const video = mediaPreviewRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    
    canvas.toBlob((blob) => {
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setMediaFile(file)
      setMediaType('image')
      setMediaPreview(URL.createObjectURL(file))
      setDuration(10)
      stopCamera()
      toast.success('Photo captured! 📸')
    }, 'image/jpeg', 0.9)
  }

  // Start video recording
  const startRecording = () => {
    if (!videoStreamRef.current) return
    
    recordedChunksRef.current = []
    const recorder = new MediaRecorder(videoStreamRef.current, { mimeType: 'video/webm' })
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }
    
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' })
      
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const dur = video.duration
        if (dur > 120) {
          toast.error('Video must be 120 seconds or less')
          return
        }
        setMediaFile(file)
        setMediaType('video')
        setMediaPreview(url)
        setDuration(dur)
        toast.success('Video recorded! 🎬')
      }
      video.src = url
      stopCamera()
    }
    
    mediaRecorderRef.current = recorder
    recorder.start()
    setIsRecording(true)
    toast.success('Recording... (max 120 sec)')
    
    // Auto-stop after 120 seconds
    setTimeout(() => {
      if (recorder.state === 'recording') {
        stopRecording()
      }
    }, 120000)
  }

  // Stop video recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  // Handle banner file selection
  const handleBannerSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    setBannerFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setBannerPreview(e.target.result)
    }
    reader.readAsDataURL(file)
  }

  // Handle info update (Website, X, Telegram)
  const handleInfoUpdate = async () => {
    if (!website && !xLink && !telegram) {
      toast.error('Please fill at least one field')
      return
    }

    setIsUploading(true)

    try {
      // Clean the hash (remove hash- prefix to match database format)
      const cleanHash = tokenData.contractHash?.replace('hash-', '') || tokenData.contractHash
      
      const response = await fetch('http://localhost:3001/api/tokens/update-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash: cleanHash,
          walletAddress,
          tokenOwner: tokenData.owner || tokenData.ownerPublicKey,
          website: website.trim(),
          x: xLink.trim(),
          telegram: telegram.trim()
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Token info updated successfully!')
        if (onUploadComplete) {
          onUploadComplete()
        }
      } else {
        toast.error(data.error || 'Failed to update info')
      }
    } catch (error) {
      console.error('Error updating info:', error)
      toast.error('Failed to update token info')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle banner update
  const handleBannerUpdate = async () => {
    if (!bannerFile) {
      toast.error('Please select a banner image')
      return
    }

    setIsUploading(true)

    try {
      // Clean the hash (remove hash- prefix to match database format)
      const cleanHash = tokenData.contractHash?.replace('hash-', '') || tokenData.contractHash
      
      const formData = new FormData()
      formData.append('banner', bannerFile)
      formData.append('tokenHash', cleanHash)
      formData.append('walletAddress', walletAddress)
      formData.append('tokenOwner', tokenData.owner || tokenData.ownerPublicKey)

      const response = await fetch('http://localhost:3001/api/tokens/update-banner', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Banner updated successfully!')
        if (onUploadComplete) {
          onUploadComplete()
        }
      } else {
        toast.error(data.error || 'Failed to update banner')
      }
    } catch (error) {
      console.error('Error updating banner:', error)
      toast.error('Failed to update banner')
    } finally {
      setIsUploading(false)
    }
  }

  const handleUpload = async () => {
    if (!mediaFile) {
      toast.error('Please select a video or image')
      return
    }

    if (!caption.trim()) {
      toast.error('Please add a caption')
      return
    }

    if (accessStatus !== 'owner' && accessStatus !== 'cto-owned') {
      toast.error('You need access to upload stories')
      return
    }

    setIsUploading(true)

    try {
      // 🔥 Use PACKAGE HASH (what's in the database) not contract hash
      const packageHash = tokenData.packageHash || tokenData.contract_package_hash?.replace(/^hash-/, '') || tokenData.contractPackageHash?.replace(/^hash-/, '')
      
      if (!packageHash) {
        toast.error('Cannot find token package hash')
        setIsUploading(false)
        return
      }
      
      const formData = new FormData()
      
      formData.append('media', mediaFile)
      formData.append('mediaType', mediaType)
      formData.append('duration', Math.round(duration).toString())
      formData.append('userWallet', walletAddress)
      formData.append('tokenHash', packageHash) // Send PACKAGE HASH
      formData.append('tokenSymbol', tokenData.symbol)
      formData.append('tokenLogo', tokenData.logo || '')
      formData.append('tokenOwner', tokenData.owner || tokenData.ownerPublicKey || '')
      formData.append('network', network) // 🔥 CRITICAL: Send network for permission check
      formData.append('caption', caption.trim())
      formData.append('overlayText', overlayText.trim())

      console.log(`📹 Uploading ${mediaType} story...`, {
        caption: caption.trim(),
        overlayText: overlayText.trim(),
        duration: Math.round(duration)
      })

      const response = await fetch('http://localhost:3001/api/stories', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        toast.success('🎉 Story uploaded successfully!')
        
        // Reset form
        setMediaFile(null)
        setCaption('')
        setOverlayText('')
        setMediaPreview(null)
        setMediaType(null)
        setDuration(0)
        setIsPlaying(false)

        if (onUploadComplete) {
          onUploadComplete(data.story)
        }

        if (onClose) {
          onClose()
        }
      } else {
        throw new Error(data.error || 'Upload failed')
      }
    } catch (error) {
      console.error('❌ Upload error:', error)
      toast.error(`Upload failed: ${error.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  const togglePlayPause = () => {
    if (mediaType === 'video') {
      const video = mediaPreviewRef.current
      if (!video) return

      if (video.paused) {
        video.play()
        setIsPlaying(true)
      } else {
        video.pause()
        setIsPlaying(false)
      }
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Access Control UI
  if (accessStatus === 'checking') {
    return (
      <>
        {/* MODAL - DOIT ÊTRE RENDU MÊME SI CHECKING */}
        <div style={{position: 'fixed', top: '10px', left: '10px', zIndex: 99999999, background: 'red', color: 'white', padding: '10px'}}>
          showPaymentModal: {showPaymentModal ? 'TRUE' : 'FALSE'}
        </div>

        {showPaymentModal && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.9)',
              zIndex: 999999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowPaymentModal(false)}
          >
            <div 
              style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '500px',
                width: '100%'
              }}
              onClick={(e) => e.stopPropagation()}
            >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                  <h3 style={{color: 'white', fontWeight: 'bold', fontSize: '18px', margin: 0}}>Payer 10 CSPR</h3>
                  <button onClick={() => setShowPaymentModal(false)} style={{background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer'}}>
                    <FaTimes size={20} />
                  </button>
                </div>
                
                <div style={{backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '12px', marginBottom: '12px'}}>
                  <p style={{color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '4px'}}>Adresse:</p>
                  <p style={{color: 'white', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all'}}>0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8</p>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText('0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8')
                      toast.success('Copié !', {duration: 1500})
                    }}
                    style={{marginTop: '8px', color: '#facc15', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer'}}
                  >
                    📋 Copier l'adresse
                  </button>
                </div>

                <div style={{marginBottom: '16px'}}>
                  <input
                    type="text"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Colle le hash ici"
                    style={{width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '14px'}}
                  />
                </div>

                <button
                  onClick={verifyPayment}
                  disabled={!txHash || txHash.length < 60 || isClaimingCTO}
                  style={{
                    width: '100%',
                    backgroundColor: '#eab308',
                    color: 'black',
                    fontWeight: 'bold',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {isClaimingCTO ? 'Vérification...' : 'Vérifier'}
                </button>
              </div>
            </div>
          )}

        <div className="glass rounded-2xl p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white/60">Checking access...</p>
        </div>
      </>
    )
  }

  if (accessStatus === 'cto-needed') {
    return (
      <>
        {/* MODAL + DEBUG */}
        <div style={{position: 'fixed', top: '10px', left: '10px', zIndex: 99999999, background: 'red', color: 'white', padding: '10px'}}>
          showPaymentModal: {showPaymentModal ? 'TRUE' : 'FALSE'}
        </div>

        {showPaymentModal && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.9)',
              zIndex: 999999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowPaymentModal(false)}
          >
            <div 
              style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '500px',
                width: '100%'
              }}
              onClick={(e) => e.stopPropagation()}
            >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                  <h3 style={{color: 'white', fontWeight: 'bold', fontSize: '18px', margin: 0}}>Payer 10 CSPR</h3>
                  <button onClick={() => setShowPaymentModal(false)} style={{background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer'}}>
                    <FaTimes size={20} />
                  </button>
                </div>
                
                <div style={{backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '12px', marginBottom: '12px'}}>
                  <p style={{color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '4px'}}>Adresse:</p>
                  <p style={{color: 'white', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all'}}>0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8</p>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText('0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8')
                      toast.success('Copié !', {duration: 1500})
                    }}
                    style={{marginTop: '8px', color: '#facc15', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer'}}
                  >
                    📋 Copier l'adresse
                  </button>
                </div>

                <div style={{marginBottom: '16px'}}>
                  <input
                    type="text"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Colle le hash ici"
                    style={{width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '14px'}}
                  />
                </div>

                <button
                  onClick={verifyPayment}
                  disabled={!txHash || txHash.length < 60 || isClaimingCTO}
                  style={{
                    width: '100%',
                    backgroundColor: '#eab308',
                    color: 'black',
                    fontWeight: 'bold',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {isClaimingCTO ? 'Vérification...' : 'Vérifier'}
                </button>
              </div>
            </div>
          )}

        <motion.div
          className="glass rounded-2xl p-8"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center">
            <FaLock className="text-white text-3xl" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            CTO Access Required
          </h3>
          <p className="text-white/60 mb-6">
            You're not the token owner. Purchase Community TakeOver (CTO) access to upload stories and earn rewards!
          </p>
        </div>

        <div className="glass-inner rounded-xl p-6 mb-6">
          <h4 className="text-lg font-bold text-white mb-4">What you get:</h4>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <FaCheck className="text-green-400 mt-1 flex-shrink-0" />
              <p className="text-white/80">Upload unlimited stories for {tokenData.symbol}</p>
            </div>
            <div className="flex items-start gap-3">
              <FaCheck className="text-green-400 mt-1 flex-shrink-0" />
              <p className="text-white/80">Earn rewards when your stories go viral</p>
            </div>
            <div className="flex items-start gap-3">
              <FaCheck className="text-green-400 mt-1 flex-shrink-0" />
              <p className="text-white/80">Top 10% daily share 10% of platform fees</p>
            </div>
            <div className="flex items-start gap-3">
              <FaCheck className="text-green-400 mt-1 flex-shrink-0" />
              <p className="text-white/80">Lifetime access - pay once, upload forever</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border-2 border-orange-500/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm">CTO Access Price</p>
              <p className="text-3xl font-bold text-white">1,000 CSPR</p>
              {reclaimInfo?.canReclaim && (
                <p className="text-green-400 text-xs mt-1">
                  ♻️ Current holder inactive - Can be reclaimed!
                </p>
              )}
            </div>
            <FaCoins className="text-yellow-400 text-4xl" />
          </div>
        </div>

        {reclaimInfo?.canReclaim && reclaimInfo.currentController && (
          <div className="glass-inner rounded-xl p-4 mb-6 border-l-4 border-green-500">
            <h4 className="text-green-400 font-bold mb-2">♻️ CTO Available for Reclaim!</h4>
            <p className="text-white/80 text-sm mb-2">
              {reclaimInfo.reason === 'owner-inactive' 
                ? `Token owner has been inactive for ${reclaimInfo.daysSinceActivity || '90+'}  days.`
                : `Current CTO holder has been inactive for ${reclaimInfo.daysSinceActivity || '90+'}  days.`
              }
              {' '}Claim CTO now and inherit all upload rights!
            </p>
            <p className="text-white/40 text-xs">
              {reclaimInfo.reason === 'owner-inactive' ? 'Inactive Owner: ' : 'Inactive CTO Holder: '}
              {reclaimInfo.currentController?.substring(0, 10)}...{reclaimInfo.currentController?.substring(reclaimInfo.currentController.length - 6)}
            </p>
          </div>
        )}

        {/* Pending payment status banner */}
        {pendingPayment && (
          <div className="glass-inner rounded-xl p-4 mb-6 border-l-4 border-yellow-500">
            <h4 className="text-yellow-400 font-bold mb-2">⏳ Payment Pending Confirmation</h4>
            <p className="text-white/80 text-sm mb-3">
              Your payment was sent successfully! Testnet confirmation is taking longer than expected.
            </p>
            <p className="text-white/40 text-xs mb-3 font-mono">
              Transaction: {pendingPayment.deployHash?.substring(0, 12)}...{pendingPayment.deployHash?.substring(pendingPayment.deployHash.length - 8)}
            </p>
            <button
              onClick={checkPendingPayment}
              disabled={checkingPayment}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-2 rounded-lg font-bold disabled:opacity-50"
            >
              {checkingPayment ? (
                <>
                  <div className="inline-block animate-spin mr-2">🔄</div>
                  Checking Status...
                </>
              ) : (
                <>
                  🔍 Check Payment Status
                </>
              )}
            </button>
          </div>
        )}

        <button
          onClick={claimCTO}
          disabled={isClaimingCTO || checkingPayment || isTestnet}
          className="w-full btn-primary py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTestnet ? (
            <>
              🔒 Switch to MAINNET to purchase CTO Access
            </>
          ) : isClaimingCTO ? (
            <>
              <div className="inline-block animate-spin mr-2">🔄</div>
              Processing Payment...
            </>
          ) : reclaimInfo?.canReclaim ? (
            <>
              ♻️ Reclaim CTO Access ({ctoConfig.price} CSPR on {network})
            </>
          ) : (
            <>
              🔥 Claim CTO Access ({ctoConfig.price} CSPR on {network})
            </>
          )}
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="w-full mt-4 px-6 py-3 glass rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
        )}
      </motion.div>
      </>
    )
  }

  if (accessStatus === 'no-access') {
    return (
      <>
        {/* MODAL + DEBUG */}
        <div style={{position: 'fixed', top: '10px', left: '10px', zIndex: 99999999, background: 'red', color: 'white', padding: '10px'}}>
          showPaymentModal: {showPaymentModal ? 'TRUE' : 'FALSE'}
        </div>

        {showPaymentModal && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.9)',
              zIndex: 999999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowPaymentModal(false)}
          >
            <div 
              style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '500px',
                width: '100%'
              }}
              onClick={(e) => e.stopPropagation()}
            >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                  <h3 style={{color: 'white', fontWeight: 'bold', fontSize: '18px', margin: 0}}>Payer 10 CSPR</h3>
                  <button onClick={() => setShowPaymentModal(false)} style={{background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer'}}>
                    <FaTimes size={20} />
                  </button>
                </div>
                
                <div style={{backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '12px', marginBottom: '12px'}}>
                  <p style={{color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '4px'}}>Adresse:</p>
                  <p style={{color: 'white', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all'}}>0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8</p>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText('0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8')
                      toast.success('Copié !', {duration: 1500})
                    }}
                    style={{marginTop: '8px', color: '#facc15', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer'}}
                  >
                    📋 Copier l'adresse
                  </button>
                </div>

                <div style={{marginBottom: '16px'}}>
                  <input
                    type="text"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Colle le hash ici"
                    style={{width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '14px'}}
                  />
                </div>

                <button
                  onClick={verifyPayment}
                  disabled={!txHash || txHash.length < 60 || isClaimingCTO}
                  style={{
                    width: '100%',
                    backgroundColor: '#eab308',
                    color: 'black',
                    fontWeight: 'bold',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {isClaimingCTO ? 'Vérification...' : 'Vérifier'}
                </button>
              </div>
            </div>
          )}

        <div className="glass rounded-2xl p-8 text-center">
          <FaTimes className="text-red-400 text-4xl mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Access Denied</h3>
          <p className="text-white/60 mb-6">
            Unable to verify access. Please try again.
          </p>
          {onClose && (
            <button onClick={onClose} className="btn-primary px-6 py-3">
              Close
            </button>
          )}
        </div>
      </>
    )
  }

  // Main Upload UI (for owners and CTO holders)
  return (
    <>

      {showPaymentModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div 
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h3 style={{color: 'white', fontWeight: 'bold', fontSize: '18px', margin: 0}}>Payer 10 CSPR</h3>
                <button onClick={() => setShowPaymentModal(false)} style={{background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer'}}>
                  <FaTimes size={20} />
                </button>
              </div>
              
              <div style={{backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '12px', marginBottom: '12px'}}>
                <p style={{color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '4px'}}>Adresse:</p>
                <p style={{color: 'white', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all'}}>0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8</p>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText('0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8')
                    toast.success('Copié !', {duration: 1500})
                  }}
                  style={{marginTop: '8px', color: '#facc15', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer'}}
                >
                  📋 Copier l'adresse
                </button>
              </div>

              <div style={{marginBottom: '16px'}}>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Colle le hash ici"
                  style={{width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '14px'}}
                />
              </div>

              <button
                onClick={verifyPayment}
                disabled={!txHash || txHash.length < 60 || isClaimingCTO}
                style={{
                  width: '100%',
                  backgroundColor: '#eab308',
                  color: 'black',
                  fontWeight: 'bold',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {isClaimingCTO ? 'Vérification...' : 'Vérifier'}
              </button>
            </div>
          </div>
        )}

      <motion.div
        className="glass rounded-2xl p-4 sm:p-6 max-w-4xl mx-auto max-h-[90vh] overflow-y-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
      
      {/* ⚠️ Inactivity Warning for CTO holders */}
      {inactivityWarning && accessStatus === 'cto-owned' && (
        <div className="mb-4 p-4 bg-orange-500/20 border-2 border-orange-500 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="text-3xl">⚠️</div>
            <div className="flex-1">
              <p className="text-orange-400 font-bold text-lg mb-2">
                CTO Inactivity Warning!
              </p>
              <p className="text-white/90 text-sm mb-2">
                {inactivityWarning.message}
              </p>
              <div className="flex items-center gap-4 text-xs text-white/70">
                <span>⏰ Inactive since: {inactivityWarning.daysInactive} days</span>
                <span className="text-orange-400 font-bold">
                  🔥 Claimable in: {inactivityWarning.daysRemaining} days
                </span>
              </div>
              <p className="text-white/60 text-xs mt-2">
                💡 Publish a story now to reset your activity timer and protect your CTO access!
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
            🔧 Dev Access
          </h2>
          <p className="text-white/60 text-xs sm:text-sm">
            {accessStatus === 'owner' ? (
              <span className="text-green-400">✓ Token Owner - FREE Access</span>
            ) : (
              <span className="text-orange-400">✓ CTO Access Granted</span>
            )}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-10 sm:h-10 glass-inner rounded-full flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <FaTimes className="text-white/60" />
          </button>
        )}
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {/* TESTNET WARNING BANNER */}
        {isTestnet && (
          <div className="w-full mb-4 p-4 bg-orange-500/20 border border-orange-500/50 rounded-xl flex items-center gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="text-orange-400 font-bold">TESTNET MODE - Read Only</p>
              <p className="text-white/70 text-sm">Switch to MAINNET to upload stories or update token info</p>
            </div>
          </div>
        )}
        
        <button
          onClick={() => !isTestnet && setActiveMode('story')}
          disabled={isTestnet}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeMode === 'story'
              ? 'bg-primary text-white'
              : isTestnet
              ? 'glass-inner text-white/30 cursor-not-allowed'
              : 'glass-inner text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FaPlay className="text-sm" />
          <span>Post Story</span>
        </button>
        <button
          onClick={() => !isTestnet && setActiveMode('info')}
          disabled={isTestnet}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeMode === 'info'
              ? 'bg-primary text-white'
              : isTestnet
              ? 'glass-inner text-white/30 cursor-not-allowed'
              : 'glass-inner text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FaInfoCircle className="text-sm" />
          <span>Update Info</span>
        </button>
        <button
          onClick={() => !isTestnet && setActiveMode('banner')}
          disabled={isTestnet}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeMode === 'banner'
              ? 'bg-primary text-white'
              : isTestnet
              ? 'glass-inner text-white/30 cursor-not-allowed'
              : 'glass-inner text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FaFlag className="text-sm" />
          <span>Update Banner</span>
        </button>
        <button
          onClick={() => !isTestnet && setActiveMode('danger')}
          disabled={isTestnet}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeMode === 'danger'
              ? 'bg-red-600 text-white'
              : isTestnet
              ? 'glass-inner text-red-400/30 cursor-not-allowed'
              : 'glass-inner text-red-400 hover:text-red-300 hover:bg-red-500/10'
          }`}
        >
          <FaTimes className="text-sm" />
          <span>Danger Zone</span>
        </button>
      </div>

      {/* Story Mode */}
      {activeMode === 'story' && (
        <>
          {/* Media Upload/Preview (Video/Image/GIF) */}
          <div className="mb-6">
          {!mediaPreview && !showCamera ? (
            <div className="space-y-3">
              {/* Upload from file */}
              <button
                onClick={() => mediaInputRef.current?.click()}
                disabled={isTestnet}
                className={`w-full aspect-video glass-inner rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-3 ${isTestnet ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <FaImage className="text-4xl text-white/40" />
                <div className="text-center">
                  <p className="text-white font-semibold mb-1">Upload Media</p>
                  <p className="text-white/40 text-sm">Video (max 120s) or Image (10s)</p>
                </div>
              </button>
              
              {/* Camera capture buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => startCamera('photo')}
                  disabled={isTestnet}
                  className={`glass-inner rounded-xl px-4 py-3 text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 ${isTestnet ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FaImage className="text-xl" />
                  <span className="font-semibold">Take Photo</span>
                </button>
                <button
                  onClick={() => startCamera('video')}
                  disabled={isTestnet}
                  className={`glass-inner rounded-xl px-4 py-3 text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 ${isTestnet ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FaVideo className="text-xl" />
                  <span className="font-semibold">Record Video</span>
                </button>
              </div>
            </div>
          ) : showCamera ? (
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
              <video
                ref={mediaPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              
              {/* Recording indicator */}
              {isRecording && (
                <div className="absolute top-4 left-4 px-3 py-1 bg-red-500 rounded-full text-white font-semibold flex items-center gap-2 animate-pulse">
                  <div className="w-3 h-3 bg-white rounded-full"></div>
                  REC
                </div>
              )}
              
              {/* Camera controls */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                {recordingMode === 'photo' ? (
                  <button
                    onClick={takePhoto}
                    className="w-16 h-16 bg-white rounded-full border-4 border-white/30 hover:scale-110 transition-transform"
                  />
                ) : (
                  <>
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="w-16 h-16 bg-red-500 rounded-full border-4 border-white/30 hover:scale-110 transition-transform"
                      />
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="w-16 h-16 bg-red-500 rounded-lg border-4 border-white/30 hover:scale-110 transition-transform"
                      />
                    )}
                  </>
                )}
                
                <button
                  onClick={stopCamera}
                  className="w-12 h-12 bg-black/60 backdrop-blur-xl rounded-full flex items-center justify-center hover:bg-black/80 transition-all"
                >
                  <FaTimes className="text-white text-xl" />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
              {mediaType === 'video' || mediaType === 'gif' ? (
                <video
                  ref={mediaPreviewRef}
                  src={mediaPreview}
                  className="w-full h-full object-cover"
                  loop
                />
              ) : (
                <img
                  src={mediaPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              )}
              
              {/* Play/Pause Overlay for videos */}
              {mediaType === 'video' && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center">
                  <button
                    onClick={togglePlayPause}
                    className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center hover:bg-white/30 transition-all"
                  >
                    {isPlaying ? (
                      <FaPause className="text-white text-2xl" />
                    ) : (
                      <FaPlay className="text-white text-2xl ml-1" />
                    )}
                  </button>
                </div>
              )}

            {/* Duration Badge */}
            <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-xl rounded-full text-white font-semibold">
              {formatDuration(duration)}
            </div>

            {/* Change Media */}
            <button
              onClick={() => {
                setMediaFile(null)
                setMediaPreview(null)
                setMediaType(null)
                setDuration(0)
              }}
              className="absolute top-4 right-4 p-2 bg-red-500/80 backdrop-blur-xl rounded-full hover:bg-red-500 transition-all"
            >
              <FaTimes className="text-white" />
            </button>
          </div>
        )}
        <input
          ref={mediaInputRef}
          type="file"
          accept="video/*,image/*"
          onChange={handleMediaSelect}
          className="hidden"
        />
      </div>

      {/* Caption */}
      <div className="mb-4">
        <label className="block text-white font-semibold mb-2">
          Caption
        </label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={`What's happening with ${tokenData.symbol}?`}
          className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50 resize-none"
          maxLength={500}
        />
        <p className="text-white/40 text-sm mt-1 text-right">
          {caption.length}/500
        </p>
      </div>

      {/* Overlay Text (optional) */}
      <div className="mb-6">
        <label className="block text-white font-semibold mb-2 flex items-center gap-2">
          Text Overlay (optional)
          <span className="text-white/40 text-xs">Displayed on media</span>
        </label>
        <input
          type="text"
          value={overlayText}
          onChange={(e) => setOverlayText(e.target.value)}
          placeholder="Enter text to display on your story..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50"
          maxLength={100}
          disabled={isTestnet}
        />
        <p className="text-white/40 text-xs mt-1">
          {overlayText.length}/100
        </p>
      </div>

      {/* Upload Button - FALLOUT STYLE */}
      <button
        onClick={handleUpload}
        disabled={isUploading || isTestnet}
        className={`relative w-full group overflow-hidden ${isTestnet ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-600 via-orange-500 to-red-600 opacity-90"></div>
        
        {/* Scan Lines Effect */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
        }}></div>
        
        {/* Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-yellow-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        {/* Corner Brackets */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-yellow-300"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-yellow-300"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-yellow-300"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-yellow-300"></div>
        
        {/* Loading Bar Animation */}
        {isUploading && (
          <div className="absolute bottom-0 left-0 h-1 bg-yellow-300 animate-pulse" style={{
            width: '100%',
            animation: 'pulse 1s ease-in-out infinite'
          }}></div>
        )}
        
        {/* Button Content */}
        <div className="relative py-5 px-8 flex items-center justify-center gap-3">
          {isUploading ? (
            <>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span className="text-yellow-100 font-mono text-lg tracking-widest uppercase font-black">
                [TRANSMITTING...]
              </span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6 text-yellow-100 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"/>
              </svg>
              <span className="text-yellow-100 font-mono text-xl tracking-widest uppercase font-black drop-shadow-[0_0_10px_rgba(253,224,71,0.5)]">
                [DEPLOY PAYLOAD]
              </span>
              <svg className="w-5 h-5 text-yellow-100 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </>
          )}
        </div>
        
        {/* Glitch Effect on Hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
        </div>
        
        {/* Disabled State Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        )}
      </button>

      {/* Warning Banner - FALLOUT STYLE */}
      <div className="mt-6 relative overflow-hidden rounded-lg border-2 border-yellow-600/50 bg-gradient-to-r from-yellow-900/20 via-orange-900/20 to-red-900/20">
        {/* Animated Warning Stripes */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(253,224,71,0.3) 10px, rgba(253,224,71,0.3) 20px)'
        }}></div>
        
        <div className="relative p-4 flex items-start gap-3">
          {/* Animated Warning Icon */}
          <div className="flex-shrink-0">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-yellow-500 rounded-full animate-ping opacity-75"></div>
              <div className="relative w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-yellow-300">
                <span className="text-black font-black text-lg">!</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <p className="text-yellow-100 font-mono text-sm leading-relaxed">
              <span className="font-black text-yellow-300">[PROTOCOL REMINDER]</span>
              <br/>
              High-engagement content receives priority resource allocation. Top performers (10% bracket) qualify for reward distribution from platform operational surplus.
            </p>
          </div>
        </div>
        
        {/* Corner Indicators */}
        <div className="absolute top-1 left-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
        <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '500ms' }}></div>
        <div className="absolute bottom-1 left-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '1000ms' }}></div>
        <div className="absolute bottom-1 right-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '1500ms' }}></div>
      </div>
        </>
      )}

      {/* Info Mode - Update Website, X, Telegram */}
      {activeMode === 'info' && (
        <div className="space-y-4">
          <div className="glass-inner rounded-xl p-4 border-l-4 border-blue-500">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              <FaInfoCircle className="text-blue-400" />
              Update Token Information
            </h3>
            <p className="text-white/60 text-sm">
              Add or update social links for your token. These will be displayed on the token page.
            </p>
          </div>

          {/* Website */}
          <div>
            <label className="block text-white font-semibold mb-2 flex items-center gap-2">
              <FaGlobe className="text-blue-400" />
              Website URL
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourtoken.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50"
              disabled={isTestnet}
            />
          </div>

          {/* X (Twitter) */}
          <div>
            <label className="block text-white font-semibold mb-2 flex items-center gap-2">
              <SiX className="text-white" />
              X / Twitter URL
            </label>
            <input
              type="url"
              value={xLink}
              onChange={(e) => setXLink(e.target.value)}
              placeholder="https://x.com/yourtoken"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50"
              disabled={isTestnet}
            />
          </div>

          {/* Telegram */}
          <div>
            <label className="block text-white font-semibold mb-2 flex items-center gap-2">
              <FaTelegram className="text-blue-400" />
              Telegram URL
            </label>
            <input
              type="url"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="https://t.me/yourtoken"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50"
              disabled={isTestnet}
            />
          </div>

          {/* Update Button */}
          <button
            onClick={handleInfoUpdate}
            disabled={isUploading || isTestnet}
            className="w-full btn-primary py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <div className="inline-block animate-spin mr-2">🔄</div>
                Updating...
              </>
            ) : (
              <>
                <FaCheck className="inline mr-2" />
                Update Information
              </>
            )}
          </button>
        </div>
      )}

      {/* Banner Mode - Update Token Banner */}
      {activeMode === 'banner' && (
        <div className="space-y-4">
          <div className="glass-inner rounded-xl p-4 border-l-4 border-purple-500">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              <FaFlag className="text-purple-400" />
              Update Token Banner
            </h3>
            <p className="text-white/60 text-sm">
              Upload a banner image for your token page. Recommended size: 1200x400px
            </p>
          </div>

          {/* Banner Preview/Upload */}
          {!bannerPreview ? (
            <button
              onClick={() => bannerInputRef.current?.click()}
              disabled={isTestnet}
              className={`w-full aspect-[3/1] glass-inner rounded-xl border-2 border-dashed border-white/20 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-3 ${isTestnet ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FaImage className="text-4xl text-white/40" />
              <div className="text-center">
                <p className="text-white font-semibold mb-1">Upload Banner</p>
                <p className="text-white/40 text-sm">1200x400px recommended</p>
              </div>
            </button>
          ) : (
            <div className="relative aspect-[3/1] rounded-xl overflow-hidden">
              <img
                src={bannerPreview}
                alt="Banner preview"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => {
                  setBannerFile(null)
                  setBannerPreview(null)
                }}
                className="absolute top-2 right-2 w-10 h-10 bg-red-500/80 backdrop-blur rounded-full flex items-center justify-center hover:bg-red-500 transition-all"
              >
                <FaTimes className="text-white" />
              </button>
            </div>
          )}

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerSelect}
            className="hidden"
          />

          {/* Update Button */}
          {bannerPreview && (
            <button
              onClick={handleBannerUpdate}
              disabled={isUploading || isTestnet}
              className="w-full btn-primary py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <div className="inline-block animate-spin mr-2">🔄</div>
                  Updating Banner...
                </>
              ) : (
                <>
                  <FaCheck className="inline mr-2" />
                  Update Banner
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Danger Zone Mode - Delete Data */}
      {activeMode === 'danger' && (
        <div className="space-y-4">
          <div className="glass-inner rounded-xl p-4 border-l-4 border-red-500">
            <h3 className="text-red-400 font-bold mb-2 flex items-center gap-2">
              <FaTimes />
              Danger Zone
            </h3>
            <p className="text-white/60 text-sm">
              Destructive actions that cannot be undone. Proceed with caution.
            </p>
          </div>

          {/* Delete My Stories */}
          <div className="glass-inner rounded-xl p-6 border border-red-500/20">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <h4 className="text-white font-bold mb-2">Delete All My Stories</h4>
                <p className="text-white/60 text-sm">
                  Permanently delete all stories you've posted for this token. This action cannot be undone.
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!confirm('⚠️ Are you sure you want to delete ALL your stories for this token? This action CANNOT be undone!')) return
                
                setIsDeletingStories(true)
                try {
                  const tokenHash = (tokenData.packageHash || tokenData.contract_package_hash || tokenData.contractPackageHash || '').replace(/^hash-/, '')
                  const response = await fetch(
                    `http://localhost:3001/api/stories/delete-my-stories/${tokenHash}/${walletAddress}`,
                    { method: 'DELETE' }
                  )
                  
                  const data = await response.json()
                  
                  if (data.success) {
                    toast.success(`✅ ${data.deletedCount} stories deleted successfully`)
                    // Close modal and refresh
                    if (onUploadComplete) onUploadComplete({ deleted: true })
                    if (onClose) onClose()
                  } else {
                    throw new Error(data.error || 'Failed to delete stories')
                  }
                } catch (error) {
                  console.error('Delete stories error:', error)
                  toast.error('Failed to delete stories: ' + error.message)
                } finally {
                  setIsDeletingStories(false)
                }
              }}
              disabled={isDeletingStories || isTestnet}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeletingStories ? (
                <>
                  <div className="inline-block animate-spin mr-2">🔄</div>
                  Deleting Stories...
                </>
              ) : (
                <>
                  🗑️ Delete All My Stories
                </>
              )}
            </button>
          </div>

          {/* Revoke CTO Access - Only show for CTO holders (not owners) */}
          {accessStatus === 'owner' ? null : (
            <div className="glass-inner rounded-xl p-6 border border-red-500/20">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1">
                  <h4 className="text-white font-bold mb-2">Revoke CTO Access</h4>
                  <p className="text-white/60 text-sm">
                    Remove your Chief Token Officer access for this token. You will need to pay again to regain access.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`⚠️ Are you sure you want to revoke your CTO access? You will need to pay ${ctoConfig.price} CSPR (${network}) again to regain access.`)) return
                  
                  setIsDeletingCTO(true)
                  try {
                    const tokenHash = (tokenData.packageHash || tokenData.contract_package_hash || tokenData.contractPackageHash || '').replace(/^hash-/, '')
                    const response = await fetch(
                      `http://localhost:3001/api/cto/revoke/${tokenHash}/${walletAddress}?network=${network}`,
                      { method: 'DELETE' }
                    )
                    
                    const data = await response.json()
                    
                    if (data.success) {
                      toast.success('✅ CTO access revoked successfully')
                      // Close modal and refresh
                      if (onUploadComplete) onUploadComplete({ revoked: true })
                      if (onClose) onClose()
                    } else {
                      throw new Error(data.error || 'Failed to revoke CTO access')
                    }
                  } catch (error) {
                    console.error('Revoke CTO error:', error)
                    toast.error('Failed to revoke CTO access: ' + error.message)
                  } finally {
                    setIsDeletingCTO(false)
                  }
                }}
                disabled={isDeletingCTO || isTestnet}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingCTO ? (
                  <>
                    <div className="inline-block animate-spin mr-2">🔄</div>
                    Revoking Access...
                  </>
                ) : (
                  <>
                    ⛔ Revoke CTO Access
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
    </>
  )
}
