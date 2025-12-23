/**
 * Service pour CSPR.fun (la plateforme de lancement de meme coins)
 * Récupère les stats RÉELLES des tokens lancés sur cspr.fun
 */

class CsprFunService {
  constructor() {
    this.baseUrl = 'https://api.cspr.fun'; // Essaye différentes URLs possibles
    this.alternativeUrls = [
      'https://cspr.fun/api',
      'https://assets.cspr.fun/api',
      'https://backend.cspr.fun'
    ];
  }

  /**
   * Vérifie si un token vient de CSPR.fun
   * @param {Object} tokenData - Données du token
   * @returns {boolean}
   */
  isCsprFunToken(tokenData) {
    return tokenData.logo?.includes('cspr.fun') || 
           tokenData.logo?.includes('assets.cspr.fun') ||
           tokenData.isCsprFun === true;
  }

  /**
   * Récupère les stats d'un token CSPR.fun
   * @param {string} contractHash - Hash du contract
   * @returns {Promise<Object|null>} Stats du token ou null
   */
  async getTokenStats(contractHash) {
    if (!contractHash) return null;

    const cleanHash = contractHash
      .replace('contract-package-wasm', '')
      .replace('hash-', '')
      .toLowerCase();

    // Essaye différentes URLs
    const urls = [
      `${this.baseUrl}/token/${cleanHash}`,
      `${this.baseUrl}/tokens/${cleanHash}`,
      `https://cspr.fun/api/token/${cleanHash}`,
      `https://assets.cspr.fun/token/${cleanHash}`,
    ];

    for (const url of urls) {
      try {
        console.log(`🎯 Trying CSPR.fun API: ${url}`);
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ CSPR.fun data:', data);
          
          return {
            holders: data.holders || data.holder_count || 0,
            transfers: data.transfers || data.transfer_count || 0,
            volume24h: data.volume_24h || data.volume || 0,
            marketCap: data.market_cap || data.mcap || 0,
            price: data.price || 0,
            liquidity: data.liquidity || 0,
            fromBlockchain: true,
            source: 'cspr.fun'
          };
        }
      } catch (error) {
        // Continue to next URL
        continue;
      }
    }

    console.warn('⚠️ CSPR.fun API: No endpoint found');
    return null;
  }

  /**
   * Récupère la liste des tokens CSPR.fun populaires
   * @returns {Promise<Array>} Liste des tokens
   */
  async getTrendingTokens() {
    try {
      const response = await fetch(`${this.baseUrl}/trending`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch trending tokens');
    }
    return [];
  }
}

// Export singleton
export default new CsprFunService();

console.log('✅ CSPR.fun Service loaded');
