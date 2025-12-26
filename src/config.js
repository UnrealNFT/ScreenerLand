// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

console.log('🔧 API Configuration:', {
  API_URL,
  mode: import.meta.env.MODE,
  isProduction: import.meta.env.PROD
})
